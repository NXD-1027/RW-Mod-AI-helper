# 铁锈战争 INI 格式说明

## 基本语法

```
# 注释（推荐，大多数 MOD 使用）
; 注释（分号也可用，但较少见）

[section]       # 段落标题
key: value      # 键值对，冒号空格分隔
key=value       # 也可以用等号
```

## 常用段落

### [core] - 核心属性
| 字段 | 说明 | 示例 |
|------|------|------|
| name | 单位标识名 | scout |
| displayText | 显示名称 | Scout |
| class | 固定值 | CustomUnitMetadata |
| price | 造价（金属） | 700 |
| maxHp | 最大生命值 | 350 |
| mass | 质量 | 500 |
| techLevel | 科技等级 1/2/3 | 1 |
| buildSpeed | 建造速度 | 0.0015 |
| radius | 碰撞半径 | 11 |
| fogOfWarSightRange | 视野范围 | 22 |
| isBio | 是否为生物 | false |
| builtFrom_X_name | 从哪个建筑生产 | landFactory |

### [graphics] - 图像
| 字段 | 说明 | 示例 |
|------|------|------|
| total_frames | 精灵图总帧数 | 1 |
| image | 单位贴图 | base.png |
| image_wreak | 残骸贴图 | base_dead.png |
| image_turret | 炮塔贴图 | turret.png |
| image_shadow | 阴影 | AUTO |
| animation_moving_start | 移动动画起始帧 | 0 |
| animation_moving_speed | 动画速度 | 2.75 |

### [attack] - 攻击
| 字段 | 说明 | 示例 |
|------|------|------|
| canAttack | 能否攻击 | true |
| canAttackFlyingUnits | 能否对空 | true |
| canAttackLandUnits | 能否对地 | true |
| turretSize | 炮塔尺寸 | 7 |
| turretTurnSpeed | 炮塔转向速度 | 4 |
| maxAttackRange | 最大射程 | 110 |
| shootDelay | 射击间隔（帧或秒） | 50 或 5s |

### [turret_XX] - 武器挂点
| 字段 | 说明 | 示例 |
|------|------|------|
| x, y | 挂点坐标 | 0, 0 |
| projectile | 弹道 ID | laser, 1 |
| turnSpeed | 炮管转速 | 3 |
| shoot_sound | 射击音效 | plasma_fire |
| shoot_flame | 枪口火焰 | small |
| warmup | 预热时间（帧） | 60 |

### [projectile_XX] - 弹道
| 字段 | 说明 | 示例 |
|------|------|------|
| directDamage | 直接伤害 | 17 |
| life | 飞行时间（帧） | 70 |
| speed | 飞行速度 | 6 |
| instant | 瞬间命中 | true |
| laserEffect | 激光效果 | true |

### [movement] - 移动
| 字段 | 说明 | 示例 |
|------|------|------|
| movementType | 移动类型 | LAND/HOVER/AIR/NAVAL/SUB/AMPHIBIOUS |
| moveSpeed | 移动速度 | 1.0 |
| moveAccelerationSpeed | 加速度 | 0.03 |
| maxTurnSpeed | 最大转向速度 | 2.4 |
| reverseSpeedPercentage | 倒车速度百分比 | 0.75 |
