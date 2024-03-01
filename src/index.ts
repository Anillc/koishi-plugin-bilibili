import { Context, Quester, Schema } from 'koishi'
import * as dynamic from './dynamic'
import * as url from './url'

export interface BilibiliChannel {}

declare module 'koishi' {
    interface Channel {
      bilibili: BilibiliChannel
    }
}

type Enable<T> = { enable: true } & T | { enable?: false }
const enable = <T>(schema: Schema<T>): Schema<Enable<T>> => Schema.intersect([
  Schema.object({ enable: Schema.boolean().default(false).description('是否开启功能。') }),
  Schema.union([
    Schema.object({
      enable: Schema.const(true),
      ...schema.dict,
    }),
    Schema.object({}),
  ]),
])

interface Config {
  dynamic: Enable<dynamic.Config>
  url: Enable<url.Config>
  quester: Quester.Config
}

export const Config: Schema<Config> = Schema.object({
  dynamic: enable(dynamic.Config).description('动态监听 (使用 dynamic 指令管理监听对象)'),
  url: enable(url.Config).description('解析 B 站视频链接'),
  quester: Quester.Config,
})

export const name = 'bilibili'

export const inject = {
  required: ['database'],
  optional: ['puppeteer'],
}

export function apply(context: Context, config: Config) {
  context.model.extend('channel', {
    bilibili: {
      type: 'json',
      initial: {},
    },
  })
  const ctx = context.isolate(['http'])
  ctx.http = context.http.extend({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      ...config.quester.headers,
    },
    ...config.quester,
  })
  if (config.dynamic.enable) ctx.plugin(dynamic, config.dynamic)
  if (config.url.enable) ctx.plugin(url, config.url)
}