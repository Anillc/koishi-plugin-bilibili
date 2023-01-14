import { Context, Quester, Schema } from 'koishi'
import * as dynamic from './dynamic'
import * as url from './url'

export interface BilibiliChannel {}

declare module 'koishi' {
    interface Channel {
      bilibili: BilibiliChannel
    }
}

interface EnableConfig {
  enable: boolean
}

interface Config {
  dynamic: dynamic.Config & EnableConfig
  url: url.Config & EnableConfig
  quester: Quester.Config
}

const enable = <T>(schema: Schema<T>): Schema<T & EnableConfig> => Schema.intersect([
  Schema.object({ enable: Schema.boolean().default(false).description('是否开启功能。') }),
  Schema.union([
    Schema.object({
      enable: Schema.const(true),
      ...schema.dict,
    }),
    Schema.object({}),
  ]) as Schema<T>,
])

export const Config: Schema<Config> = Schema.object({
  dynamic: enable(dynamic.Config).description('动态监听 (使用 dynamic 指令管理监听对象)'),
  url: enable(url.Config).description('解析 B 站视频链接'),
  quester: Quester.Config,
})

export const name = 'bilibili'

export const using = ['database']

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
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
      ...config.quester.headers,
    },
    ...config.quester,
  })
  if (config.dynamic.enable) ctx.plugin(dynamic, config.dynamic)
  if (config.url.enable) ctx.plugin(url, config.url)
}