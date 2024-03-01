import { Context, Element, Schema } from 'koishi'
import { toAvid } from './utils'

// av -> 6 avid -> 8 bv -> 9
const VIDEO_REGEX = /(((https?:\/\/)?(www.|m.)?bilibili.com\/(video\/)?)?((av|AV)(\d+)|((BV|bv)1[1-9A-NP-Za-km-z]{9})))/
// value -> 4
const B23_REGEX = /((https?:\/\/)?(b23.tv|bili2233.cn)\/(((av|ep|ss)\d+)|BV1[1-9A-NP-Za-km-z]{9}|\S{6,7}))/

export interface Config {
  lengthLimit: number
}

export const Config: Schema<Config> = Schema.object({
  lengthLimit: Schema.number().description('简介的最大长度，设置为 0 则不限制。').default(100),
})

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('bilibili/url')

  ctx.middleware(async ({ elements }, next) => {
    const contents = [
      ...elements.filter(e => e.type === 'json').map(processJson),
      ...elements.filter(e => e.type === 'text').map(e => e.attrs.content),
    ]
    for (const content of contents) {
      const avid = await ensureAvid(content)
      if (avid) return next(async () => await render(avid))
    }
    return next()
  })

  async function ensureAvid(url: string) {
    let match: RegExpExecArray
    while (match = B23_REGEX.exec(url)) {
      const result = await ctx.http(`https://b23.tv/${match[4]}`, { redirect: 'manual' })
      if (result.status !== 302) return
      url = result.headers.get('location')
    }
    if (match = VIDEO_REGEX.exec(url)) {
      return match[8] || toAvid(match[9]).toString()
    }
  }

  function processJson(e: Element): string {
    const data = JSON.parse(e.attrs.data)
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { detail_1, news } = data.meta
    if (detail_1) return detail_1.qqdocurl
    if (news) return news.jumpUrl
  }

  async function render(avid: string) {
    const { data } = await ctx.http.get(`https://api.bilibili.com/x/web-interface/view?aid=${avid}`)
    const up = data.staff?.map(staff => staff.name).join('/') || data.owner.name
    let desc: string = data.desc
    if (config.lengthLimit !== 0 && desc.length > config.lengthLimit) {
      desc = desc.substring(0, config.lengthLimit) + '...'
    }
    return `<image url="${data.pic}"/>
标题: ${data.title}
UP 主: ${up}
点赞: ${data.stat.like} | 硬币: ${data.stat.coin} | 收藏: ${data.stat.favorite}
播放: ${data.stat.view} | 弹幕: ${data.stat.danmaku} | 评论: ${data.stat.reply}
简介: ${desc}
https://bilibili.com/video/av${avid}`
  }
}
