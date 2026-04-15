"""CLI entrypoint for notebook-lm."""

import argparse
import sys

from .wrapper import add_source, ask_question, create_notebook, get_notebook_state, list_notebooks


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

    # add-source <notebook_id> <source>
    add_source_parser = subparsers.add_parser("add-source", help="Add a source to a notebook")
    add_source_parser.add_argument("notebook_id", help="Notebook ID")
    add_source_parser.add_argument("source", help="URL or file path to add as source")

    # ask <notebook_id> <question>
    ask_parser = subparsers.add_parser("ask", help="Ask a question to a notebook")
    ask_parser.add_argument("notebook_id", help="Notebook ID")
    ask_parser.add_argument("question", help="Question to ask")

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
        notebooks = list_notebooks()
        print(f"notebook-lm: {len(notebooks)} notebook(s)")
        return 0

    if args.command == "add-source":
        result = add_source(args.notebook_id, args.source)
        print(f"Source added: {args.source}")
        print(f"Status: {result.get('status', 'unknown')}")
        return 0

    if args.command == "ask":
        result = ask_question(args.notebook_id, args.question)
        answer = result.get("answer", str(result))
        print(answer)
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
