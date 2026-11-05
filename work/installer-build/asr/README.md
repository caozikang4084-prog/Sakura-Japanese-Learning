# 本地语音识别试用资源

- `python/`：便携式 Python 运行时，仅用于启动本地识别脚本。
- `lib/`：Vosk 0.3.45 的 Windows x64 运行库。
- `model/`：Vosk 日语 small model `vosk-model-small-ja-0.22`。
- `vosk-recognize.py`：使用 Python 标准库 `ctypes` 调用 `libvosk.dll`，不依赖 Vosk Python 包或其他第三方 Python 包。

识别完全在本机执行，不需要云端 API。模型和运行库的再分发许可需要在正式发布前核对；当前仅用于本地试用。
