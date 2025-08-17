# =============================================================================
# 🚀 ENHANCED ZSH CONFIGURATION
# =============================================================================
# 
# 💡 For the best experience, install a Nerd Font:
#    https://www.nerdfonts.com/font-downloads
#    Recommended: Hack Nerd Font, FiraCode Nerd Font, or JetBrains Mono Nerd Font
# 
# 🔧 To enable Powerline symbols, set your terminal font to a Nerd Font
#    and ensure your terminal supports Unicode characters
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
# 🎯 ALIASES & FUNCTIONS
# =============================================================================

# Navigation
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias .....='cd ../../../..'

# List directory contents
alias ll='ls -la'
alias la='ls -A'
alias l='ls -CF'
alias lsd='ls -la | grep "^d"'

# Git shortcuts
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git log --oneline --graph --decorate'
alias gco='git checkout'
alias gcb='git checkout -b'
alias gb='git branch'
alias gd='git diff'
alias gf='git fetch'
alias gm='git merge'
alias grb='git rebase'

# Docker shortcuts
alias d='docker'
alias dc='docker-compose'
alias dps='docker ps'
alias dpsa='docker ps -a'
alias di='docker images'
alias dex='docker exec -it'
alias dlog='docker logs'

# Development
alias py='python3'
alias pip='pip3'
alias node='node'
alias npm='npm'
alias yarn='yarn'

# System
alias c='clear'
alias h='history'
alias j='jobs -l'
alias ports='netstat -tulanp'
alias myip='curl http://ipecho.net/plain; echo'
alias weather='curl -s "wttr.in/?format=3"'

# =============================================================================
# 🎨 PROMPT CUSTOMIZATION
# =============================================================================

# Custom prompt function with Powerline and Nerd Fonts
function custom_prompt() {
  # Exit code
  local exit_code=$?
  
  # Powerline symbols (requires Nerd Fonts)
  local SEPARATOR="%F{240}"
  local BRANCH="%F{240}"
  local DETACHED="%F{240}"
  local AHEAD="%F{240}↑"
  local BEHIND="%F{240}↓"
  local STAGED="%F{240}●"
  local UNSTAGED="%F{240}✚"
  local UNTRACKED="%F{240}…"
  local STASHED="%F{240}⚑"
  local CLEAN="%F{240}✔"
  local MERGE="%F{240}⚡"
  local REBASE="%F{240}⚡"
  
  # Git status with advanced features
  local git_status=""
  if git rev-parse --git-dir > /dev/null 2>&1; then
    local git_branch=$(git branch --show-current 2>/dev/null)
    local git_remote=""
    local git_ahead=""
    local git_behind=""
    local git_dirty=""
    local git_stash=""
    local git_state=""
    
    # Check if we're in a git repository
    if [[ -n "$git_branch" ]]; then
      # Check for merge/rebase state
      if [[ -d ".git/rebase-merge" ]]; then
        git_state=" %F{red}${REBASE}"
      elif [[ -d ".git/rebase-apply" ]]; then
        git_state=" %F{red}${REBASE}"
      elif [[ -f ".git/MERGE_HEAD" ]]; then
        git_state=" %F{red}${MERGE}"
      fi
      
      # Check if branch is ahead/behind
      git_remote=$(git for-each-ref --format='%(upstream:short)' $(git symbolic-ref -q HEAD) 2>/dev/null)
      if [[ -n "$git_remote" ]]; then
        git_ahead=$(git rev-list --count HEAD..$git_remote 2>/dev/null)
        git_behind=$(git rev-list --count $git_remote..HEAD 2>/dev/null)
      fi
      
      # Check for stashed changes
      if git rev-parse --verify refs/stash >/dev/null 2>&1; then
        git_stash=" %F{blue}${STASHED}"
      fi
      
      # Check for uncommitted changes
      if ! git diff --quiet --ignore-submodules --cached 2>/dev/null; then
        git_dirty=" %F{green}${STAGED}"
      fi
      if ! git diff-files --quiet --ignore-submodules 2>/dev/null; then
        git_dirty="${git_dirty} %F{red}${UNSTAGED}"
      fi
      if [[ -n $(git ls-files --others --exclude-standard 2>/dev/null) ]]; then
        git_dirty="${git_dirty} %F{blue}${UNTRACKED}"
      fi
      
      # Build git status string with Powerline style
      git_status=" %F{240}${BRANCH} %F{cyan}${git_branch}"
      if [[ -n "$git_ahead" && "$git_ahead" != "0" ]]; then
        git_status="${git_status} %F{green}${AHEAD}${git_ahead}"
      fi
      if [[ -n "$git_behind" && "$git_behind" != "0" ]]; then
        git_status="${git_status} %F{red}${BEHIND}${git_behind}"
      fi
      git_status="${git_status}${git_dirty}${git_stash}${git_state}"
    else
      # Detached HEAD state
      local git_commit=$(git rev-parse --short HEAD 2>/dev/null)
      if [[ -n "$git_commit" ]]; then
        git_status=" %F{240}${DETACHED} %F{red}${git_commit}"
      fi
    fi
  fi
  
  # Current directory with home directory shortening and Nerd Fonts
  local current_dir=$(pwd | sed "s|^$HOME|~|")
  local current_dir="%F{blue} ${current_dir}"
  
  # Exit code indicator with Nerd Fonts
  local exit_indicator=""
  if [[ $exit_code -ne 0 ]]; then
    exit_indicator=" %F{red}✗"
  else
    exit_indicator=" %F{green}✓"
  fi
  
  # Username and hostname with Nerd Fonts
  local user_host="%F{cyan} %n%F{white}@%F{green}%m"
  
  # Build the prompt with Powerline-style separators and visual hierarchy
  PROMPT="%F{blue}%B${user_host}%b%F{blue} ${SEPARATOR} %F{white}${current_dir}${git_status}${exit_indicator}"$'\n'"%F{white}❯ "
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