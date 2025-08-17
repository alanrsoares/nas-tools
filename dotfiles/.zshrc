# =============================================================================
# 🚀 ENHANCED ZSH CONFIGURATION
# =============================================================================

# =============================================================================
# 📁 OH MY ZSH CONFIGURATION
# =============================================================================

# Path to your Oh My Zsh installation
export ZSH="$HOME/.oh-my-zsh"

# Modern theme with better visual appeal
ZSH_THEME="agnoster"

# Auto-update behavior
zstyle ':omz:update' mode auto
zstyle ':omz:update' frequency 7

# =============================================================================
# 🔌 PLUGINS - Enhanced productivity
# =============================================================================

plugins=(
  git
  zsh-autosuggestions
  zsh-syntax-highlighting
  docker
  docker-compose
  node
  npm
  yarn
  vscode
  macos
  history
  extract
  sudo
  copypath
  dirhistory
  web-search
  jsontools
  urltools
  colored-man-pages
  command-not-found
)

# =============================================================================
# ⚡ PERFORMANCE OPTIMIZATIONS
# =============================================================================

# Disable marking untracked files as dirty for better performance
DISABLE_UNTRACKED_FILES_DIRTY="true"

# Disable auto-setting terminal title for better performance
DISABLE_AUTO_TITLE="true"

# =============================================================================
# 🎨 COMPLETION & INTERFACE ENHANCEMENTS
# =============================================================================

# Case-insensitive completion
HYPHEN_INSENSITIVE="true"

# Display red dots whilst waiting for completion
COMPLETION_WAITING_DOTS="true"

# Enable command auto-correction
ENABLE_CORRECTION="true"

# =============================================================================
# 📚 HISTORY CONFIGURATION
# =============================================================================

# History settings
HISTSIZE=10000
SAVEHIST=10000
HISTFILE=~/.zsh_history

# History options
setopt SHARE_HISTORY          # Share history between different instances of the shell
setopt HIST_EXPIRE_DUPS_FIRST # Expire duplicate entries first when trimming history
setopt HIST_IGNORE_DUPS       # Don't record an entry that was just recorded again
setopt HIST_IGNORE_ALL_DUPS   # Delete old recorded entry if new entry is a duplicate
setopt HIST_FIND_NO_DUPS      # Do not display a line previously found
setopt HIST_SAVE_NO_DUPS      # Don't write duplicate entries in the history file
setopt HIST_REDUCE_BLANKS     # Remove superfluous blanks before recording entry
setopt HIST_VERIFY            # Don't execute immediately upon history expansion
setopt HIST_BEEP              # Beep when accessing nonexistent history

# History format with timestamps
HIST_STAMPS="yyyy-mm-dd"

# =============================================================================
# 🔧 ENVIRONMENT VARIABLES
# =============================================================================

# Language and locale
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# Editor configuration
if command -v nvim &> /dev/null; then
  export EDITOR='nvim'
  export VISUAL='nvim'
elif command -v vim &> /dev/null; then
  export EDITOR='vim'
  export VISUAL='vim'
else
  export EDITOR='nano'
  export VISUAL='nano'
fi

# Path enhancements
export PATH="$HOME/bin:$HOME/.local/bin:/usr/local/bin:$PATH"

# Node.js version manager (if using nvm)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Rust (if installed)
[ -s "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

# =============================================================================
# 🎨 PROMPT CUSTOMIZATION
# =============================================================================

# Custom prompt function
function custom_prompt() {
  # Exit code
  local exit_code=$?
  
  # Git branch
  local git_branch=""
  if git rev-parse --git-dir > /dev/null 2>&1; then
    git_branch="$(git branch --show-current)"
    if [[ -n "$git_branch" ]]; then
      git_branch="%F{green} (%F{white} %F{yellow}$git_branch%F{green})"
    fi
  fi
  
  # Current directory
  local current_dir="%F{cyan} %~"
  
  # Exit code indicator
  local exit_indicator=""
  if [[ $exit_code -ne 0 ]]; then
    exit_indicator=" %F{red}✗"
  else
    exit_indicator=" %F{green}✓"
  fi  
  # Set prompt
  PROMPT="%F{red} $current_dir$git_branch$exit_indicator"$'\n'"%F{white}❯ "
}

# Set custom prompt
autoload -U add-zsh-hook
add-zsh-hook precmd custom_prompt

# =============================================================================
# 🔍 ENHANCED COMPLETION
# =============================================================================

# Initialize completion system
autoload -Uz compinit
compinit

# Completion options
zstyle ':completion:*' auto-description 'specify: %d'
zstyle ':completion:*' completer _expand _complete _correct _approximate
zstyle ':completion:*' format 'Completing %d'
zstyle ':completion:*' group-name ''
zstyle ':completion:*' menu select=2
zstyle ':completion:*:default' list-colors ${(s.:.)LS_COLORS}
zstyle ':completion:*' list-colors ''
zstyle ':completion:*' list-prompt %SAt %p: Hit TAB for more, or the character to insert%s
zstyle ':completion:*' matcher-list '' 'm:{a-z}={A-Z}' 'm:{a-zA-Z}={A-Za-z}' 'r:|[._-]=* r:|=* l:|=*'
zstyle ':completion:*' select-prompt %SScrolling active: current selection at %p%s
zstyle ':completion:*' use-compctl false
zstyle ':completion:*' verbose true

# =============================================================================
# ⌨️ KEY BINDINGS
# =============================================================================

# Use emacs key bindings
bindkey -e

# History search
bindkey '^[[A' history-beginning-search-backward
bindkey '^[[B' history-beginning-search-forward

# Word navigation
bindkey '^[[1;5C' forward-word
bindkey '^[[1;5D' backward-word

# Delete word
bindkey '^H' backward-kill-word
bindkey '^[[3;5~' kill-word

# =============================================================================
# 🚀 STARTUP OPTIMIZATIONS
# =============================================================================

# Disable flow control commands (keeps C-s from freezing everything)
stty -ixon

# =============================================================================
# 📦 SOURCE EXTERNAL FILES
# =============================================================================

# Source Oh My Zsh
source $ZSH/oh-my-zsh.sh

# Source additional configuration files
[[ -f ~/.envs ]] && source ~/.envs
[[ -f ~/.aliases ]] && source ~/.aliases
[[ -f ~/.functions ]] && source ~/.functions

# =============================================================================
# 🎉 WELCOME MESSAGE
# =============================================================================

# Display system info on startup
echo "🚀 Welcome back, $(whoami)! Your enhanced shell is ready."
echo "📅 $(date '+%A, %B %d, %Y at %I:%M %p')"
echo "💻 $(uname -srm)"
echo ""

# =============================================================================
# 🔧 AUTO-LOAD PLUGINS (if not already loaded by Oh My Zsh)
# =============================================================================

# Auto-suggestions
if [[ ! -f ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh ]]; then
  echo "💡 Tip: Install zsh-autosuggestions for better completion:"
  echo "   git clone https://github.com/zsh-users/zsh-autosuggestions ~/.zsh/zsh-autosuggestions"
fi

# Syntax highlighting
if [[ ! -f ~/.zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]]; then
  echo "💡 Tip: Install zsh-syntax-highlighting for syntax highlighting:"
  echo "   git clone https://github.com/zsh-users/zsh-syntax-highlighting ~/.zsh/zsh-syntax-highlighting"
fi