# 第四批：关卡页签、主页海湾与剩余收藏生物

- 风格参照：`art/style/anchor_a.png`；现有四个 tab 图标仅作质感参照。
- 使用内置 image_gen，原创设计；无现有游戏角色参考。
- 页签：`assets/ui/tab_levels.png`，144×144 RGBA。
- 主页：`assets/ui/home_scene.jpg`，1024×1536，JPEG 质量 85；中部留空。
- 生物：下列 44 张 `assets/fish/<id>.png`，192×192 RGBA，朝左，至少 8px 透明边。
- 原始输出：`art/raw/batch4/tab_levels.png`、`home_scene.png`、`sheet1.png`、`sheet2.png`、`sheet3.png`。
- 总览：`art/raw/batch4/contact.png`。
- 按 `tools/art/slice.py` 4×4、4×4、4×3 网格切片并保留抗锯齿，随后统一 8px 留边。
- 仓库无 tools/art/pack，环境无 pngquant；PNG 使用 Pillow optimize 无损压缩。
- 未运行 Godot；全部请求资源已制作，视觉验收仍由用户确认。

| ID | 名字 | 主色 | 轮廓 |
|---|---|---|---|
| c17 | 薄荷卷 | mint | fish |
| c18 | 汽水泡 | cyan | ball |
| c19 | 盐团团 | teal | seal |
| c20 | 蓝豆豆 | blue | ball |
| c21 | 海纹纹 | blue | longfin |
| c22 | 沙花饼 | amber | disc |
| c23 | 墨绒绒 | indigo | cuttlefish |
| c24 | 夜飘带 | navy | eel |
| c25 | 葡萄软 | purple | slug |
| c26 | 紫弯弯 | purple | shrimp |
| c27 | 芋耳朵 | lavender | legs |
| c28 | 桃管管 | pink | snout |
| c29 | 糯花花 | pink | slug |
| c30 | 樱贝贝 | rose | clam |
| u01 | 叶卷龙 | red | dragon |
| u02 | 霞扇扇 | orange | fan |
| u03 | 饼壳壳 | amber | hermit |
| u04 | 蛋黄爪 | yellow | legs |
| u05 | 青方方 | lime | box |
| u06 | 苹耳耳 | lime | hare |
| u07 | 翠尾卷 | green | fish |
| u08 | 叶背背 | green | shell |
| u09 | 薄荷墩 | mint | manatee |
| u10 | 浪裙裙 | cyan | slug |
| u11 | 冰围围 | cyan | beluga |
| u12 | 雪领领 | blue | bird |
| u13 | 星帽帽 | indigo | squid |
| u14 | 芋飘飘 | purple | ribbon |
| u15 | 桃绒条 | pink | cucumber |
| r01 | 珠卷卷 | gold | tall |
| r02 | 琉璃伞 | cyan | umbrella |
| r03 | 花鼓鼓 | peach | ball |
| r04 | 珠帽丸 | lavender | legs |
| r05 | 金扇饼 | gold | flatfish |
| r06 | 星灯灯 | azure | lantern |
| r07 | 珠星酥 | coral | star |
| r08 | 珊钳钳 | crimson | claws |
| e01 | 晶背宝 | green | shell |
| e02 | 星披披 | purple | diamond |
| e03 | 珠角团 | lavender | narwhal |
| e04 | 云冠鲨 | sky | shark |
| e05 | 珠旋旋 | peach | nautilus |
| l01 | 曦尾锦 | gold | koi |
| l02 | 月眠鲸 | navy | whale |

## 英文提示词记录

Common/uncommon sheets: Original chibi ocean creature sprite sheet, exact evenly spaced 4×4 grid, pure white background, no ground shadows, no text or labels, ample gutters, all face LEFT; glossy painted gradients, dark teal outlines, large gleaming eyes, round dumpling proportions matching anchor_a; no teeth or sharp spines; unique sea species and small shell/leaf accessories as listed above.

Premium sheet: Same reference and constraints, exact 4×3 grid; rare pearl ornaments, epic luminous crystal/constellation details, legendary golden koi and galaxy whale; every decoration connected to its creature.

Levels icon: Original glossy treasure map with winding path, three turquoise stepping stones and red flag, transparent background, matching existing tab icons; no letters or numbers.

Home bay: Original portrait underwater bay, sunlit surface, turquoise calm empty middle, sandy seabed, side coral and shells, tiny shell-shaped village at lower edges; no characters, fish, UI or text.
