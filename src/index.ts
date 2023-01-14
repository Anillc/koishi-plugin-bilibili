import { Context, Quester, Schema } from 'koishi'
import * as dynamic from './dynamic'

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
  quester: Quester.Config
}

const enable = <T>(schema: Schema<T>): Schema<T & EnableConfig> => Schema.intersect([
  Schema.object({ enable: Schema.boolean().default(false).description('是否开启功能。') }),
  Schema.union([
    Schema.object({
      enable: Schema.const(true).required(),
      ...schema.dict,
    }),
    Schema.object({}),
  ]) as Schema<T>,
])

export const Config: Schema<Config> = Schema.object({
  dynamic: enable(dynamic.Config).description('动态监听'),
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
  ctx.http = context.http.extend(config.quester)
  if (config.dynamic.enable) ctx.plugin(dynamic, config.dynamic)
}