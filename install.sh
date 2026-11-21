#!/usr/bin/env bash
set -euo pipefail

APP=loloxcode
BASE_URL="${LOLOXCODE_BASE_URL:-https://github.com/fluxxyz67/loloxcode}"
INSTALL_DIR="${LOLOXCODE_INSTALL_DIR:-$HOME/.loloxcode/bin}"
MUTED='\033[0;2m'
RED='\033[0;31m'
NC='\033[0m'

usage() {
    cat <<EOF
loloXcode CLI installer

Usage: install.sh [options]

Options:
    -h, --help              Display this help message
    -v, --version <tag>     Install a specific release tag (e.g. v1.0.0)
    -b, --binary <path>     Install from a local binary instead of downloading
        --no-modify-path    Don't modify shell config files (.zshrc, .bashrc, etc.)

Environment:
    LOLOXCODE_INSTALL_DIR   Install directory (default: \$HOME/.loloxcode/bin)
    LOLOXCODE_BASE_URL      Download base (default: https://github.com/fluxxyz67/loloxcode)

Examples:
    curl -fsSL https://raw.githubusercontent.com/fluxxyz67/loloxcode/main/install.sh | bash
    curl -fsSL https://raw.githubusercontent.com/fluxxyz67/loloxcode/main/install.sh | bash -s -- --version v1.0.0
    ./install.sh --binary /path/to/loloxcode
EOF
}

info() { echo -e "${MUTED}$1${NC}"; }
error() { echo -e "${RED}$1${NC}" >&2; }
die() { error "$1"; exit 1; }

requested_version=""
no_modify_path=false
binary_path=""
tmp_dir=""

trap 'rm -rf "${tmp_dir:-}"' EXIT

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help) usage; exit 0 ;;
        -v|--version)
            [[ -n "${2:-}" ]] || die "Error: --version requires a tag"
            requested_version="$2"
            shift 2
            ;;
        -b|--binary)
            [[ -n "${2:-}" ]] || die "Error: --binary requires a path"
            binary_path="$2"
            shift 2
            ;;
        --no-modify-path) no_modify_path=true; shift ;;
        *) error "Warning: unknown option '$1'"; shift ;;
    esac
done

detect_platform() {
    local raw_os arch
    raw_os=$(uname -s)
    case "$raw_os" in
        Darwin*) os="darwin" ;;
        Linux*) os="linux" ;;
        MINGW*|MSYS*|CYGWIN*)
            die "This installer is for Linux and macOS. On Windows run install.ps1 in PowerShell instead."
            ;;
        *) die "Unsupported OS: $raw_os" ;;
    esac

    arch=$(uname -m)
    case "$arch" in
        x86_64|amd64) arch="x64" ;;
        aarch64|arm64) arch="arm64" ;;
        *) die "Unsupported architecture: $arch" ;;
    esac

    if [ "$os" = "darwin" ] && [ "$arch" = "x64" ]; then
        if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
            arch="arm64"
        fi
    fi

    case "$os-$arch" in
        linux-x64|linux-arm64|darwin-x64|darwin-arm64) ;;
        *) die "Unsupported platform: $os/$arch" ;;
    esac

    target="$os-$arch"
    if [ "$os" = "linux" ]; then
        if [ -f /etc/alpine-release ] || { command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl; }; then
            target="$target-musl"
        fi
    fi
}

download_url() {
    if [ -n "$requested_version" ]; then
        case "$requested_version" in
            v*) tag="$requested_version" ;;
            *) tag="v$requested_version" ;;
        esac
        DOWNLOAD_URL="$BASE_URL/releases/download/$tag"
    else
        DOWNLOAD_URL="$BASE_URL/releases/latest/download"
    fi
}

verify_checksum() {
    local dir="$1" asset="$2" line
    command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1 || {
        info "No sha256 tool found, skipping checksum verification"
        return 0
    }
    if ! curl -fsSL -o "$dir/SHA256SUMS" "$DOWNLOAD_URL/SHA256SUMS" 2>/dev/null; then
        info "SHA256SUMS not published for this release, skipping checksum verification"
        return 0
    fi
    line=$(awk -v a="$asset" '$2 == a { print }' "$dir/SHA256SUMS")
    if [ -z "$line" ]; then
        info "No checksum listed for $asset, skipping checksum verification"
        return 0
    fi
    if command -v sha256sum >/dev/null 2>&1; then
        (cd "$dir" && printf '%s\n' "$line" | sha256sum -c -)
    else
        (cd "$dir" && printf '%s\n' "$line" | shasum -a 256 -c -)
    fi
}

install_binary() {
    local source="$1"
    mkdir -p "$INSTALL_DIR"
    cp "$source" "$INSTALL_DIR/$APP"
    chmod 755 "$INSTALL_DIR/$APP"
    if [ "$(uname -s)" = "Darwin" ] && command -v xattr >/dev/null 2>&1; then
        xattr -d com.apple.quarantine "$INSTALL_DIR/$APP" 2>/dev/null || true
    fi
}

download_and_install() {
    command -v curl >/dev/null 2>&1 || die "curl is required but not installed"
    command -v tar >/dev/null 2>&1 || die "tar is required but not installed"

    local asset="$APP-$target.tar.gz"
    tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/loloxcode.XXXXXX")

    info "Downloading $DOWNLOAD_URL/$asset"
    curl -fL --retry 3 -o "$tmp_dir/$asset" "$DOWNLOAD_URL/$asset" || die "Download failed"
    verify_checksum "$tmp_dir" "$asset"
    tar -xzf "$tmp_dir/$asset" -C "$tmp_dir" || die "Could not extract $asset"
    [ -f "$tmp_dir/$APP" ] || die "Archive did not contain $APP"
    install_binary "$tmp_dir/$APP"
}

modify_path() {
    [ "$no_modify_path" = "true" ] && return 0

    local shell_name config_files config_file new_config_file
    shell_name=$(basename "${SHELL:-sh}")
    case "$shell_name" in
        fish) config_files="$HOME/.config/fish/config.fish" ;;
        zsh) config_files="${ZDOTDIR:-$HOME}/.zshrc ${ZDOTDIR:-$HOME}/.zshenv" ;;
        bash) config_files="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile" ;;
        *) config_files="$HOME/.profile" ;;
    esac

    config_file=""
    for file in $config_files; do
        if [ -f "$file" ]; then config_file="$file"; break; fi
    done

    if [ -z "$config_file" ]; then
        case "$shell_name" in
            zsh) new_config_file="${ZDOTDIR:-$HOME}/.zshrc" ;;
            fish) new_config_file="$HOME/.config/fish/config.fish" ;;
            *) new_config_file="" ;;
        esac
        if [ -n "$new_config_file" ] && mkdir -p "$(dirname "$new_config_file")" && touch "$new_config_file"; then
            config_file="$new_config_file"
        fi
    fi

    if [ -z "$config_file" ]; then
        error "No shell config file found. Add this line manually:"
        echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
        return 0
    fi

    if grep -Fq "$INSTALL_DIR" "$config_file"; then
        info "$INSTALL_DIR is already on PATH in $config_file"
        return 0
    fi

    if [ "$shell_name" = "fish" ]; then
        printf '\n# loloxcode\nfish_add_path %s\n' "$INSTALL_DIR" >> "$config_file"
    else
        printf '\n# loloxcode\nexport PATH="%s:$PATH"\n' "$INSTALL_DIR" >> "$config_file"
    fi
    path_added=true
    info "Added $INSTALL_DIR to PATH in $config_file"
}

if [ -n "$binary_path" ]; then
    [ -f "$binary_path" ] || die "Binary not found at $binary_path"
    install_binary "$binary_path"
else
    detect_platform
    download_url
    download_and_install
fi

modify_path

if [ -n "${GITHUB_ACTIONS:-}" ] && [ "$GITHUB_ACTIONS" = "true" ]; then
    echo "$INSTALL_DIR" >> "$GITHUB_PATH"
fi

version=$("$INSTALL_DIR/$APP" --version 2>/dev/null || echo "unknown")
echo ""
echo -e "${MUTED}loloXcode CLI installed${NC}  $INSTALL_DIR/$APP"
echo -e "${MUTED}Version:${NC} $version"
echo ""
if [ "${path_added:-false}" = "true" ]; then
    echo -e "Open a new terminal (or run ${MUTED}exec \$SHELL${NC}), then start with:"
else
    echo -e "Start with:"
fi
echo ""
echo -e "  loloxcode        ${MUTED}# Open the TUI in the current directory${NC}"
echo ""
