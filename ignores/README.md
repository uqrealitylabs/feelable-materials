# Ignore snippets

These `.gignore` files are reusable snippets. Copy or merge the right snippets into your actual project `.gitignore`.

> [!NOTE]
> Pick the ignore file for the engine you actually use. More ignores is not automatically better.

Do not blindly use every ignore file. Unity projects usually need `.meta` files tracked. Unity and Unreal can produce huge generated folders. Godot export credentials should not be committed.

> [!WARNING]
> Never commit secrets, licence files, paid asset-store packages, or generated build outputs.

Keep paid/private assets out of public repos. If a project needs large binary assets, choose a clear storage plan before committing them.
