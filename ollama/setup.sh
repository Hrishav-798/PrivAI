#!/bin/bash
# PrivAI — Ollama Model Setup Script
# Downloads and configures the VLM model for the backend

set -e

echo "=== PrivAI Ollama Model Setup ==="
echo ""

# Check Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "ERROR: Ollama is not installed."
    echo "Install from: https://ollama.com/download"
    exit 1
fi

# Check Ollama is running
if ! curl -s http://localhost:11434/api/version > /dev/null 2>&1; then
    echo "Starting Ollama..."
    ollama serve &
    sleep 3
fi

echo "1. Pulling base model: qwen2.5vl:7b"
echo "   This may take several minutes on first run (~5GB download)..."
ollama pull qwen2.5vl:7b

echo ""
echo "2. Creating PrivAI custom model with redaction-aware prompt..."
ollama create privai-vlm -f Modelfile

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Available models:"
ollama list | grep -E "qwen2.5vl|privai-vlm"
echo ""
echo "Test with: ollama run privai-vlm 'What action should I take on a search page?'"
