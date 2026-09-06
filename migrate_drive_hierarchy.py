"""
Standalone Google Drive Option 2 (Full Directory Tree Hierarchy) Migration Script.
Mirrors users and in-app folder hierarchy directly onto Google Drive:
- Creates dedicated root folders for users (User_{username} (ID {id}))
- Mirrors in-app folders and sub-folders inside each user's Google Drive folder
- Moves existing files to their respective target folders on Google Drive
- 100% safe: Preserves Google Drive file IDs, so all stream, preview, and download links remain intact!
"""

import sys
import os

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app import create_app, db
from app.utils.db_models import User, Folder, FileItem
from app.utils.google_drive_api import (
    is_google_api_configured,
    get_or_create_user_drive_folder,
    get_or_create_app_folder_in_drive,
    get_drive_file_parents,
    move_drive_item
)

# Reconfigure standard output encoding if needed on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def run_migration(verbose=True):
    """
    Executes the full directory tree migration on Google Drive.
    Returns a dict with execution statistics.
    """
    if not is_google_api_configured():
        msg = "[ERROR] Google Drive API is not configured! Please check your credentials / environment variables."
        if verbose:
            print(msg)
        return {"success": False, "error": msg}

    stats = {
        "success": True,
        "users_processed": 0,
        "folders_processed": 0,
        "files_moved": 0,
        "files_already_in_place": 0,
        "files_skipped": 0,
        "errors": []
    }

    if verbose:
        print("=" * 70)
        print("[START] GOOGLE DRIVE HIERARCHY MIGRATION (OPTION 2)")
        print("=" * 70)

    # -------------------------------------------------------------
    # Step 1: Migrate / Verify User Google Drive Folders
    # -------------------------------------------------------------
    users = User.query.order_by(User.id.asc()).all()
    if verbose:
        print(f"\n[STEP 1] Migrating {len(users)} user root folders...")

    for u in users:
        try:
            folder_id = get_or_create_user_drive_folder(u)
            stats["users_processed"] += 1
            if verbose:
                print(f"  [OK] User '{u.username}' (ID {u.id}) -> Drive Folder: {folder_id}")
        except Exception as e:
            err_msg = f"User {u.username}: {str(e)}"
            stats["errors"].append(err_msg)
            if verbose:
                print(f"  [FAIL] Error migrating user '{u.username}': {e}")

    # -------------------------------------------------------------
    # Step 2: Migrate / Verify In-App Folder Tree
    # -------------------------------------------------------------
    def migrate_folder_recursive(folder):
        try:
            drive_folder_id = get_or_create_app_folder_in_drive(folder, user=folder.user)
            stats["folders_processed"] += 1
            if verbose:
                print(f"  [OK] Folder '{folder.name}' (ID {folder.id}, User {folder.user_id}) -> Drive Folder: {drive_folder_id}")
        except Exception as e:
            err_msg = f"Folder {folder.name} (ID {folder.id}): {str(e)}"
            stats["errors"].append(err_msg)
            if verbose:
                print(f"  [FAIL] Error migrating folder '{folder.name}': {e}")

        for sub in folder.subfolders.all():
            migrate_folder_recursive(sub)

    root_folders = Folder.query.filter(Folder.parent_id.is_(None)).all()
    if verbose:
        print(f"\n[STEP 2] Migrating {Folder.query.count()} in-app folders...")

    for f in root_folders:
        migrate_folder_recursive(f)

    # -------------------------------------------------------------
    # Step 3: Move Existing Files into Respective Folders on Google Drive
    # -------------------------------------------------------------
    files = FileItem.query.all()
    if verbose:
        print(f"\n[STEP 3] Checking and moving {len(files)} files to target folders...")

    for file_item in files:
        if not file_item.drive_file_id:
            stats["files_skipped"] += 1
            continue

        # Skip multipart json or legacy gas/local uploads if not drive ID
        if file_item.drive_file_id.startswith("[") or file_item.drive_file_id.startswith("{"):
            stats["files_skipped"] += 1
            continue

        if file_item.source_type not in ("google_api_upload", "direct_link"):
            stats["files_skipped"] += 1
            continue

        try:
            # Determine target Google Drive folder
            if file_item.folder_id and file_item.folder:
                target_drive_folder = get_or_create_app_folder_in_drive(file_item.folder, user=file_item.user)
            else:
                target_user = file_item.user
                if not target_user and file_item.user_id:
                    target_user = User.query.get(file_item.user_id)
                target_drive_folder = get_or_create_user_drive_folder(target_user)

            if not target_drive_folder:
                stats["files_skipped"] += 1
                continue

            # Check where file currently is
            current_parents = get_drive_file_parents(file_item.drive_file_id)
            if target_drive_folder in current_parents:
                stats["files_already_in_place"] += 1
                if verbose:
                    print(f"  [SKIP] File '{file_item.filename}' already in target folder.")
                continue

            # Move file on Google Drive
            success = move_drive_item(file_item.drive_file_id, target_drive_folder)
            if success:
                stats["files_moved"] += 1
                if verbose:
                    print(f"  [MOVED] '{file_item.filename}' -> Drive Folder: {target_drive_folder}")
            else:
                err_msg = f"Failed to move file '{file_item.filename}' ({file_item.drive_file_id})"
                stats["errors"].append(err_msg)
                if verbose:
                    print(f"  [FAIL] Failed to move '{file_item.filename}'")

        except Exception as e:
            err_msg = f"File {file_item.filename}: {str(e)}"
            stats["errors"].append(err_msg)
            if verbose:
                print(f"  [FAIL] Error on file '{file_item.filename}': {e}")

    if verbose:
        print("\n" + "=" * 70)
        print("[SUMMARY] MIGRATION COMPLETE:")
        print(f"  * Users processed:         {stats['users_processed']}")
        print(f"  * Folders mirrored:        {stats['folders_processed']}")
        print(f"  * Files moved:             {stats['files_moved']}")
        print(f"  * Files already in place:  {stats['files_already_in_place']}")
        print(f"  * Files skipped:           {stats['files_skipped']}")
        print(f"  * Errors encountered:      {len(stats['errors'])}")
        print("=" * 70)

    return stats


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        run_migration(verbose=True)
