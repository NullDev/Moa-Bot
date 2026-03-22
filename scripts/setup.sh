#!/usr/bin/env bash
set -e

# Install Node deps
npm install

# Setup Python venv
python3 -m venv .venv
source .venv/bin/activate

# Upgrade pip + install deps
pip install --upgrade pip
pip install numpy scikit-learn

echo "Setup complete!"
