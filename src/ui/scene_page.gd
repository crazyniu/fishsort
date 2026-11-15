class_name ScenePage
extends HomePage
## 旧的「家园」页（用星星建设场景）。新版底栏已改成抽奖页，这页不再从任何入口到达，
## 代码先留在仓库里，等确认不再需要时整个删除。


func build() -> void:
	var list: Array = Config.scenes["scenes"]
	var index: int = int(Save.data["scene"])
	var done_all: bool = index >= list.size()
	var scene: Dictionary = list[mini(index, list.size() - 1)]
	title(tr(scene["name"]))
	var side: float = minf(620.0, size.y - 330.0)
	var frame := UiKit.piece("row")
	add(frame, Vector2((W - side) / 2.0 - 12, 96), Vector2(side + 24, side + 24))
	var art := TextureRect.new()
	art.texture = UiKit.tex("res://assets/ui/scene1.jpg")
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.size = Vector2(side, side)
	art.position = Vector2(12, 12)
	frame.add_child(art)
	var steps: Array = scene["steps"]
	var step: int = steps.size() if done_all else int(Save.data["sceneStep"])
	# 还没建的部分用灰度表示：建得越多画面越鲜亮
	art.modulate = Color.WHITE.lerp(Color(0.45, 0.5, 0.55), 1.0 - float(step) / steps.size())
	var y: float = side + 140
	add(UiKit.piece("chip"), Vector2(95, y - 4), Vector2(560, 52))
	if step > 0:
		add(
			UiKit.piece("fill"),
			Vector2(95, y),
			Vector2(maxf(48.0, 560.0 * step / steps.size()), 44)
		)
	add(UiKit.label("%d/%d" % [step, steps.size()], 28), Vector2(95, y), Vector2(560, 42))
	if done_all:
		add(UiKit.label(tr("UI_BUILD_DONE"), 26), Vector2(0, y + 60), Vector2(W, 60))
		return
	var cost: int = int(steps[step])
	var build := btn(
		self,
		tr("UI_BUILD") % cost,
		UiKit.ORANGE,
		Vector2(175, y + 62),
		Vector2(400, 96),
		_on_build.bind(frame),
		38
	)
	if int(Save.data["stars"]) >= cost:
		Anim.pulse(build, 1.05, 1.0)


func _on_build(frame: Control) -> void:
	var before: int = int(Save.data["scene"])
	if not Meta.build_step(Save.data, Config.scenes):
		_show_need_stars()
		return
	Save.save()
	Audio.sfx(&"bowl_done")
	Anim.squash(frame, 0.05)
	Anim.burst(
		host,
		frame.position + frame.size / 2.0 + Vector2(0, HomeScreen.TOP_H),
		14,
		"res://assets/ui/star.png",
		520.0,
		700.0,
		Vector2(26, 46),
		0.8,
		60
	)
	host.refresh_top()
	if int(Save.data["scene"]) != before:
		Audio.sfx(&"win")
		Anim.confetti(host, host.size.x)
		host.toast(tr("UI_SCENE_CHEST"))
	await get_tree().create_timer(0.35).timeout
	if is_inside_tree() and true:
		host.rebuild_page()


## 星星不够：告诉玩家还差几颗，并给一个直接去闯关的按钮
func _show_need_stars() -> void:
	Audio.sfx(&"error")
	var list: Array = Config.scenes["scenes"]
	var steps: Array = list[int(Save.data["scene"])]["steps"]
	var missing: int = int(steps[int(Save.data["sceneStep"])]) - int(Save.data["stars"])
	var lines: Array[String] = [tr("UI_NEED_STARS_MORE") % missing]
	var popup := (
		PopupCard
		. open(
			host,
			tr("UI_NEED_STARS_TITLE"),
			lines,
			[
				[tr("UI_GO_PLAY"), UiKit.GREEN, host.start_level],
			],
			150
		)
	)
	var star := UiKit.icon("res://assets/ui/star.png", 130)
	add_to(popup.card, star, Vector2((PopupCard.CARD_W - 130) / 2.0, popup.content_y + 6))
	star.modulate = Color(0.75, 0.8, 0.9, 0.9)
	Anim.wiggle(star, 10.0, 0.9)
