FROM python:3.11-slim

# 🔒 Create non-root user for security
RUN useradd -m -u 1000 -s /bin/bash jupyteruser

WORKDIR /workspace

# Install Jupyter
RUN pip install --no-cache-dir jupyterlab

# 🔒 Set ownership to non-root user
RUN chown -R jupyteruser:jupyteruser /workspace

# Switch to non-root user
USER jupyteruser

EXPOSE 8888

# 🔒 Run with security configurations
# --ContentsManager.allow_hidden=False: Don't show hidden files
# --ServerApp.disable_check_xsrf=False: Enable XSRF protection
# --ServerApp.open_browser=False: Security best practice
CMD ["jupyter", "lab", \
     "--no-browser", \
     "--ip=0.0.0.0", \
     "--port=8888", \
     "--ServerApp.allow_remote_access=True", \
     "--ServerApp.disable_check_xsrf=False", \
     "--ContentsManager.allow_hidden=False"]
