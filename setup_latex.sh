#!/bin/bash

echo "Installing LaTeX ... (this may take a while) ..."
sudo apt-get install texlive-full -y

echo "Installing Convert ..."
sudo apt-get install imagemagick -y

echo "LaTeX and Convert installed successfully"
