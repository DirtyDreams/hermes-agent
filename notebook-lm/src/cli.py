"""CLI entrypoint for notebook-lm."""

import argparse
import sys

from .wrapper import create_notebook, get_notebook_state, list_notebooks


def main() -> int:
    parser = argparse.ArgumentParser(prog="notebook-lm")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # create <name>
    create_parser = subparsers.add_parser("create", help="Create a new notebook")
    create_parser.add_argument("name", help="Notebook name")

    # list
    subparsers.add_parser("list", help="List all notebooks")

    # status
    subparsers.add_parser("status", help="Show status")

    args = parser.parse_args()

    if args.command == "create":
        result = create_notebook(args.name)
        print(result.get("id", result))
        return 0

    if args.command == "list":
        notebooks = list_notebooks()
        for nb in notebooks:
            print(f"{nb.get('id', '')}  {nb.get('name', '')}")
        return 0

    if args.command == "status":
        print("notebook-lm ready")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
