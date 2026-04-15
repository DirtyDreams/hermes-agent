"""CLI entrypoint for notebook-lm."""

import argparse
import sys
from pathlib import Path

from .output import download_all
from .wrapper import (
    add_source,
    ask_question,
    create_notebook,
    download_artifact,
    generate,
    get_notebook_state,
    list_notebooks,
    SUPPORTED_TYPES,
)


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

    # generate <notebook_id> <type>
    gen_parser = subparsers.add_parser("generate", help="Generate content (audio, video, quiz, etc.)")
    gen_parser.add_argument("notebook_id", help="Notebook ID")
    gen_parser.add_argument("type", choices=SUPPORTED_TYPES, help="Type of content to generate")
    gen_parser.add_argument("--wait", action="store_true", help="Wait for generation to complete")

    # download <notebook_id> <artifact_type>
    dl_parser = subparsers.add_parser("download", help="Download generated artifacts")
    dl_parser.add_argument("notebook_id", help="Notebook ID")
    dl_parser.add_argument("artifact_type", choices=SUPPORTED_TYPES, help="Type of artifact to download")
    dl_parser.add_argument("--output", default="~/notebook-lm-output", help="Output directory")

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

    if args.command == "generate":
        result = generate(args.notebook_id, args.type, args.wait)
        print(f"Generation started: {result.get('job_id', 'unknown')}")
        if args.wait:
            print(f"Output: {result.get('output', result)}")
        return 0

    if args.command == "download":
        output_dir = Path(args.output).expanduser()
        paths = download_artifact(args.notebook_id, args.artifact_type, output_dir)
        for p in paths:
            print(f"Downloaded: {p}")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
