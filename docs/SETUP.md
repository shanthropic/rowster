# Rowster — Setup

---

## Prerequisites (All Platforms)

- **Rust Toolchain**: Version 1.85 or newer (2024 edition) installed via `rustup`.
- **Node.js**: Version 20 or newer with `npm`.
- **Git**: For version control.

---

## Platform Requirements

### Windows

1. **WebView2 Runtime**: Included with Windows 11 and Windows 10 (auto-installed by the Tauri installer if absent).
2. **MSVC Build Tools**: Visual Studio Build Tools with the "Desktop development with C++" workload installed, or run:
   ```powershell
   winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --add Microsoft.VisualStudio.Workload.VCTools"
   ```
3. **Rust Toolchain**: `rustup toolchain install stable-msvc`.

### macOS

1. **Xcode Command Line Tools**:
   ```sh
   xcode-select --install
   ```
2. **WebKit**: WKWebView is provided directly by the operating system (macOS 12+ supported).

### Linux (Debian / Ubuntu)

Install WebKitGTK and essential development libraries:

```sh
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

> [!NOTE]
> Under Wayland environments, if tab positioning anomalies occur due to upstream compositor behavior, enable `linux_compat_mode` in settings or run under X11 / XWayland. See [LIMITATIONS.md](./LIMITATIONS.md) for details.

---

## Theme Generation

Rowster uses the Astryx design system. Theme tokens are compiled into CSS:

```powershell
npm run theme:build
```

---

## Local Data Storage Locations

- **Windows**: `%APPDATA%\com.rowster.app\`
- **Linux**: `~/.config/com.rowster.app/`
- **macOS**: `~/Library/Application Support/com.rowster.app/`
- **Logs**: File logs are written to `rowster.log` inside the app data directory. Set `RUST_LOG=rowster=trace` for verbose tracing during development.