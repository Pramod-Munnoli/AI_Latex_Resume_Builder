# Use a lightweight Node image
FROM node:18-slim

# Install TeX Live and essential LaTeX packages
# We use a minimal set to keep the image size down
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-fonts-recommended \
    texlive-latex-extra \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install project dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose the backend port
EXPOSE 8000

# Start the application
CMD ["npm", "start"]
