import { Context, Logger, Quester, Schema } from 'koishi'
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

const logger = new Logger('bilibili/url')

export function apply(ctx: Context, config: Config) {
  ctx.middleware(async ({ elements }, next) => {
    try {
      for (const element of elements) {
        if (element.type !== 'text') continue
        const avid = await testVideo(element.attrs.content, ctx.http)
        if (avid) return next(async () => {
          return await render(avid, ctx.http, config.lengthLimit)
        })
      }
    } catch (e) {
      logger.error('请求时发生异常: ', e)
    }
    return next()
  })
}

async function testVideo(content: string, http: Quester): Promise<string> {
  let match: RegExpExecArray
  if (match = B23_REGEX.exec(content)) {
    const url = await parseB23(match[4], http)
    return await testVideo(url, http)
  } else if (match = VIDEO_REGEX.exec(content)) {
    return match[8] || toAvid(match[9]).toString()
  }
}

async function parseB23(value: string, http: Quester): Promise<string> {
  const result = await http.axios(`https://b23.tv/${value}`, {
    maxRedirects: 0,
    validateStatus: status => status === 302,
  })
  return result.headers['location']
}

async function render(avid: string, http: Quester, lengthLimit: number) {
  const { data } = await http.get(`https://api.bilibili.com/x/web-interface/view?aid=${avid}`)
  const up = data.staff?.map(staff => staff.name).join('/') || data.owner.name
  let desc: string = data.desc
  if (lengthLimit !== 0 && desc.length > lengthLimit) {
    desc = desc.substring(0, lengthLimit) + '...'
  }
  return `<image url="${data.pic}"/>
标题: ${data.title}
UP 主: ${up}
点赞: ${data.stat.like} | 硬币: ${data.stat.coin} | 收藏: ${data.stat.favorite}
播放: ${data.stat.view} | 弹幕: ${data.stat.danmaku} | 评论: ${data.stat.reply}
简介: ${desc}
https://bilibili.com/video/av${avid}`
}