# Base image
FROM node:20-bullseye

# Instalar Banco, Cache e Dependências Python para a Extração Interna de Vídeo
RUN apt-get update && apt-get install -y \
    redis-server \
    supervisor \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Setup Python Virtual Environment and Install Heavy ML dependencies
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install PyTorch (CUDA 12.1 version to enable NVIDIA RTX acceleration)
RUN pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install Whisper, Pyannote for Diarization, and dependencies
RUN pip install setuptools-rust faster-whisper pyannote.audio

# Setup working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install
RUN npm install @prisma/client@5 bullmq @azure/msal-node @microsoft/microsoft-graph-client isomorphic-fetch
RUN npm install ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google
RUN npm install -D prisma@5

# Copy application code
COPY . .

# Generate prisma client (SQLite requires no external server during build)
RUN npx prisma generate

# Adjust permissions so non-root users can write to /app (e.g. SQLite database)
RUN chown -R node:node /app
RUN chmod -R 775 /app

# Build Next.js app
RUN npm run build

# Copy Supervisord configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy and setup auto-healing entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Expose Next.js port
EXPOSE 3000

# Start supervisord as the main process via entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
