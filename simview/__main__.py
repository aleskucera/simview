def clear():
    from simview import CACHE_DIR
    from pathlib import Path

    tmp_dir = Path("/tmp") / CACHE_DIR
    home_dir = Path.home() / f"{'.cache'}/{CACHE_DIR}"

    if tmp_dir.exists():
        print(f"Removing {tmp_dir}")
        for item in tmp_dir.iterdir():
            if item.is_dir():
                item.rmdir()
            else:
                item.unlink()

    if home_dir.exists():
        print(f"Removing {home_dir}")
        for item in home_dir.iterdir():
            if item.is_dir():
                item.rmdir()
            else:
                item.unlink()

    print("Cache cleared.")


if __name__ == "__main__":
    import sys

    CMD_TO_FUN = {"clear": clear}
    if len(sys.argv) < 2:
        print("Please provide a command.")
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd in CMD_TO_FUN:
        CMD_TO_FUN[cmd]()
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
