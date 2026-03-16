"""Entry point: python -m lkagent start"""
from lkagent.agent import server, cli

if __name__ == "__main__":
    cli.run_app(server)
