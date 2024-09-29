import { Context, Logger, z } from 'koishi'
import * as dynamic from './dynamic'
import * as url from './url'

declare module 'koishi' {
  interface Events {
    'bilibili/bad-request'(): void
  }
}

type Enable<T> = { enable: true } & T | { enable?: false }
const enable = <T>(schema: z<T>, description: string): z<Enable<T>> => z.intersect([
  z.object({ enable: z.boolean().default(false).description('是否开启功能。') }).description(description),
  z.union([
    z.object({
      enable: z.const(true).required(),
      ...schema.dict,
    }),
    z.object({}),
  ]),
])

interface Config {
  shared: {
    cookie: string
    userAgent: string
  }
  dynamic: Enable<dynamic.Config>
  url: Enable<url.Config>
}

export const Config: z<Config> = z.object({
  shared: z.object({
    cookie: z.string().description('B 站 Cookie').role('textarea').default(''),
    userAgent: z.string().description('User-Agent').role('textarea').default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'),
  }),
  dynamic: enable(dynamic.Config, '动态监听 (使用 dynamic 指令管理监听对象)'),
  url: enable(url.Config, '解析 B 站视频链接'),
})

export const name = 'bilibili'

export const logger = new Logger(name)

export const inject = {
  required: ['database'],
  optional: ['puppeteer'],
}

export function apply(ctx: Context, config: Config) {
  ctx.model.extend('channel', {
    bilibili: {
      type: 'json',
      initial: {},
    },
  })

  ctx.inject(['puppeteer'], async (ctx2) => {
    const page = await ctx2.puppeteer.page()
    ctx2.on('dispose', () => page.close())
    ctx2.on('bilibili/bad-request', async () => {
      await page.goto('https://www.bilibili.com', { waitUntil: 'networkidle0' })
      const cookies = await page.cookies()
      await page.goto('about:blank')
      const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join('; ')
      config.shared.cookie = cookie
      ctx.scope.update(config, true)
    })
  })
  // ctx.on('bilibili/bad-request', () => logger.warn('请求失败'))
  if (config.dynamic.enable) {
    ctx.plugin(dynamic, {
      ...config.dynamic,
      ...config.shared,
    })
  }
  if (config.url.enable) {
    ctx.plugin(url, config.url)
  }
}
