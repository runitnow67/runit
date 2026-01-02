# RUNIT

RUNIT is a Colab-style remote execution platform where:

- Providers run a lightweight agent on their machine
- Each agent starts a Jupyter notebook locally
- Notebooks are exposed via secure tunnels
- A central control plane matches renters to providers
- Notebook traffic never flows through the server

## Architecture

Browser → Provider Notebook (via tunnel)  
Server → Control plane only

## Why this matters

GPUs are not shared over the internet.
Compute is moved to where the GPU exists.

This repo demonstrates that model.
