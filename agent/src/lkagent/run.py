"""Console-script entry point for the LiveKit voice agent."""
from lkagent.agent import server, cli

def main():
    cli.run_app(server)
