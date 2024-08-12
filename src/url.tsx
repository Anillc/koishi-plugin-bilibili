import { Context, h, Schema } from 'koishi'
import { bv2av } from './utils'

// av -> 6 avid -> 8 bv -> 9
const VIDEO_REGEX = /(((https?:\/\/)?(www.|m.)?bilibili.com\/(video\/)?)?((av|AV)(\d+)|((BV|bv)1[1-9A-NP-Za-km-z]{9})))/
// value -> 4
const B23_REGEX = /((https?:\/\/)?(b23.tv|bili2233.cn)\/(((av|ep|ss)\d+)|BV1[1-9A-NP-Za-km-z]{9}|\S{6,7}))/
// from https://gist.github.com/dperini/729294
// eslint-disable-next-line max-len
const URL_REGEX = /(?:(?:(?:https?|ftp):)?\/\/)?(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?)(?::\d{2,5})?(?:[/?#]\S*)?/ig

export interface Config {
  behavior: 'text' | 'mixed' | 'image'
  maxline: number
  urlExtract: boolean
}

export const Config: Schema<Config> = Schema.object({
  behavior: Schema.union([
    Schema.const('text').description('直接发送，按行数截断'),
    Schema.const('mixed').description('超过行数则渲染成图片发送'),
    Schema.const('image').description('渲染成图片发送'),
  ]).description('简介的渲染行为，没有 puppeteer 时回退到文本').role('radio').default('mixed'),
  maxline: Schema.number().default(5).description('简介的最大行数，设置为 0 则不限制'),
  urlExtract: Schema.boolean().default(false).description('发图时提取链接以文本发送'),
})

// from https://github.com/koishijs/koishi-plugin-imagify/blob/master/src/template.thtml
const template = `<html>
<head>
<meta charset="utf-8">
<style>
body{
  font-size: 1.3rem;
  padding: 2rem;
  background: #fff;
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center center;
}
.text-card{
  padding: 0.8rem 2rem;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 16px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10)
}
</style>
</head>
<body style="display: inline-block">
<div class="text-card">
{placeholder}
</div>
</body>
</html>`

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('bilibili/url')

  ctx.middleware(async ({ elements }, next) => {
    const contents = [
      ...elements.filter(e => e.type === 'json').map(processJson),
      ...elements.filter(e => e.type === 'text').map(e => e.attrs.content),
    ]
    for (const content of contents) {
      const avid = await ensureAvid(content)
      if (avid) return render(avid)
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
      return match[8] || bv2av(match[9]).toString()
    }
  }

  function processJson(e: h): string {
    const data = JSON.parse(e.attrs.data)
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { detail_1, news } = data.meta
    if (detail_1) return detail_1.qqdocurl
    if (news) return news.jumpUrl
  }

  async function render(avid: string) {
    const { data } = await ctx.http.get(`https://api.bilibili.com/x/web-interface/view?aid=${avid}`)
    const { aid, stat } = data
    const up = data.staff?.map(staff => staff.name).join('/') || data.owner.name
    const date = (new Date(data.pubdate * 1000)).toLocaleString()
    let duration = `${data.duration % 60} 秒`
    if (data.duration > 60) {
      duration = `${Math.floor(data.duration / 60)} 分 ${duration}`
    }
    const summary = `
标题: ${data.title}
UP 主: ${up} | 时长: ${duration}
发布时间: ${date}
点赞: ${stat.like} | 硬币: ${stat.coin} | 收藏: ${stat.favorite}
播放: ${stat.view} | 弹幕: ${stat.danmaku} | 评论: ${stat.reply}\n\n`
    const desc: string = data.desc
    let newDesc: string | h[]
    let urls: string
    const lines = desc.split('\n')
    const renderText = config.behavior === 'text' || !ctx.puppeteer
      || config.behavior === 'mixed' && lines.length <= config.maxline
    if (renderText) {
      if (config.maxline === 0) {
        newDesc = desc
      } else {
        newDesc = lines.slice(0, config.maxline).join('\n')
      }
    } else {
      const html = template.replace('{placeholder}', lines.reduce((x, acc) => x + `<div>${acc}</div>`, ''))
      newDesc = h.parse(await ctx.puppeteer.render(html))
      if (config.urlExtract) {
        urls = desc.match(URL_REGEX)?.join('\n') || ''
      }
    }
    return <>
      {`https://bilibili.com/video/av${aid}`}
      <image url={data.pic} />
      {summary}
      {newDesc}
      {urls}
    </>
  }
}
