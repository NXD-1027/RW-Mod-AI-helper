# mod.info 文件格式说明

mod.info 是 MOD 的入口文件，放在 MOD 文件夹根目录。
使用纯粹的键值对格式，没有 [section] 段落。

## 基本结构

```
name: my_mod
displayText: 我的MOD
version: 1.0
description: 这是我的第一个MOD
author: 作者名
gameVersion: 1.15
```

## 全部可用字段

| 字段 | 必填 | 说明 |
|------|:----:|------|
| `name` | ✅ | MOD 唯一标识名，只能用字母、数字、下划线 |
| `displayText` | ❌ | 玩家在游戏中看到的 MOD 名称 |
| `version` | ❌ | MOD 版本号（如 1.0） |
| `description` | ❌ | MOD 简短描述 |
| `author` | ❌ | 作者名 |
| `minVersion` | ❌ | 最低游戏版本要求（如 1.15p7） |
| `gameVersion` | ❌ | 兼容的游戏版本（如 1.15） |
| `modVersion` | ❌ | MOD 格式版本，固定填 1 |
| `type` | ❌ | MOD 类型：unit（单位MOD）/ mod（综合MOD）/ total-conversion（完全转换） |
| `sourceFolder` | ❌ | 指定读取文件的子目录（不填则读整个 MOD 文件夹） |
| `addToNormalPlaylist` | ❌ | 是否添加到普通游戏模式，true/false |
| `whenUsingUnitsFromThisMod_playExclusively` | ❌ | 使用此 MOD 单位时是否只加载此 MOD，true/false |

## 完整示例

```
name: my_awesome_tank
displayText: 我的超级坦克
version: 1.0
description: 一辆拥有超强火力的重型坦克，适合新手使用
author: MOD作者
gameVersion: 1.15
minVersion: 1.15p7
modVersion: 1
type: unit
addToNormalPlaylist: false
```

## 注意事项
- mod.info 没有 [core] 段落，直接写键值对
- 字段名区分大小写，全部小写
- 值不要加引号
- 文件编码用 UTF-8
