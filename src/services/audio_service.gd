extends Node
## autoload「Audio」：音效与背景音乐。开关存在存档的 settings 里。

const SFX_VOICES := 6

var _voices: Array[AudioStreamPlayer] = []
var _next: int = 0
var _music: AudioStreamPlayer
var _streams: Dictionary = {}


func _ready() -> void:
	for i: int in SFX_VOICES:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_voices.append(p)
	_music = AudioStreamPlayer.new()
	_music.volume_db = -8.0
	# WAV 默认不循环，播完接着播
	_music.finished.connect(func() -> void: _music.play())
	add_child(_music)


func _stream(name: StringName) -> AudioStream:
	if not _streams.has(name):
		var path: String = "res://assets/audio/%s.wav" % name
		_streams[name] = load(path) if ResourceLoader.exists(path) else null
	return _streams[name]


func sfx(name: StringName, pitch: float = 1.0) -> void:
	if not bool(Save.data["settings"]["sound"]):
		return
	var stream: AudioStream = _stream(name)
	if stream == null:
		return
	var p: AudioStreamPlayer = _voices[_next]
	_next = (_next + 1) % SFX_VOICES
	p.stream = stream
	p.pitch_scale = pitch
	p.play()


func play_music() -> void:
	if not bool(Save.data["settings"]["music"]) or _music.playing:
		return
	_music.stream = _stream(&"bgm")
	if _music.stream != null:
		_music.play()


func set_music(on: bool) -> void:
	Save.data["settings"]["music"] = on
	Save.save()
	if on:
		play_music()
	else:
		_music.stop()


func set_sound(on: bool) -> void:
	Save.data["settings"]["sound"] = on
	Save.save()
