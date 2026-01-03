FROM python:3.11-slim

WORKDIR /workspace

# Install Jupyter
RUN pip install --no-cache-dir jupyterlab

EXPOSE 8888

CMD ["jupyter", "lab","--no-browser","--ip=0.0.0.0","--port=8888","--allow-root"]
