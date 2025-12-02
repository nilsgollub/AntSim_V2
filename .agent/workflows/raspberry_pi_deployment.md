---
description: How to run AntSim V2 on a Raspberry Pi
---

This guide explains how to set up and run the AntSim V2 project on a Raspberry Pi.

## Prerequisites

1.  **Raspberry Pi** (Model 3B+ or 4 recommended for better performance).
2.  **Raspberry Pi OS** (Desktop version recommended if you want to view it on the Pi itself).
3.  **Internet Connection**.

## Step 1: Install Node.js and Git

Open a terminal on your Raspberry Pi and run the following commands to update your system and install Node.js and Git.

```bash
# Update system
sudo apt update
sudo apt upgrade -y

# Install Git
sudo apt install git -y

# Install Node.js (Version 18 or later recommended)
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node -v
npm -v
```

## Step 2: Clone the Repository

Clone the AntSim V2 repository to your Raspberry Pi.

```bash
# Navigate to a directory (e.g., Documents)
cd ~/Documents

# Clone the repository (Replace with your actual repo URL if different)
git clone https://github.com/nilsgollub/AntSim_V2.git

# Enter the directory
cd AntSim_V2
```

## Step 3: Install Dependencies

Install the project dependencies using npm.

```bash
npm install
```

## Step 4: Run the Simulation

### Option A: Development Mode (Slow, but editable)
Use this if you want to make changes to the code on the Pi.

```bash
# Start the development server
# --host 0.0.0.0 allows access from other devices on the network
npm run dev -- --host 0.0.0.0
```
*   Access locally: `http://localhost:5173`
*   Access from network: `http://<YOUR_PI_IP_ADDRESS>:5173`

### Option B: Production Build (Recommended for Performance)
This builds the project and serves the optimized files.

1.  **Build the project:**
    ```bash
    npm run build
    ```

2.  **Preview/Serve the build:**
    ```bash
    npm run preview -- --host 0.0.0.0
    ```
    *   Access locally: `http://localhost:4173`
    *   Access from network: `http://<YOUR_PI_IP_ADDRESS>:4173`

## Performance Tips for Raspberry Pi

*   **Browser:** Use Chromium (default) or Firefox.
*   **Quality Settings:** In the simulation UI, set the Quality to **LOW** or **MEDIUM**. The Raspberry Pi GPU is limited compared to a desktop PC.
*   **Resolution:** Running the browser in full screen (F11) can sometimes help.
*   **Overclocking:** If you are comfortable, minor overclocking of the Pi 4 can improve frame rates.

## Auto-Start (Optional)

To start the simulation automatically on boot:

1.  Install `pm2` globally:
    ```bash
    sudo npm install -g pm2
    ```
2.  Start the preview server:
    ```bash
    pm2 start npm --name "antsim" -- run preview -- --host 0.0.0.0
    ```
3.  Save the list:
    ```bash
    pm2 save
    ```
4.  Generate startup script:
    ```bash
    pm2 startup
    ```
    (Run the command output by the previous step).
