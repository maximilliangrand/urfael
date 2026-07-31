#!/bin/bash
# install-mac.command — the easy button for macOS. DOUBLE-CLICK this file.
#
# A .command file opens Terminal and runs on double-click. It launches the guided installer, which installs
# every prerequisite for you (Homebrew, Node, git, ffmpeg, Claude Code), sets everything up, runs the setup
# wizard, and offers to open the app. Nothing to install by hand.
#
# First time you double-click a file downloaded from the internet, macOS may say it "cannot be opened because
# it is from an unidentified developer." If so: right-click the file → Open → Open. (That's Gatekeeper on an
# unsigned helper, not a problem with the file.)
cd "$(dirname "$0")" || exit 1
echo ""
echo "  Starting the Urfael guided installer…"
echo "  (installs Homebrew, Node, git, ffmpeg and Claude Code for you if they're missing)"
echo ""
exec bash ./install.sh --guided
