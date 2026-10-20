"""Prepare bundled contour indexes without starting the app or contacting NOAA."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.bathymetry_service import LOCAL_CONTOUR_INDEX_DIR, prepare_local_contour_indexes


if __name__ == "__main__":
    prepare_local_contour_indexes(LOCAL_CONTOUR_INDEX_DIR)
    print(f"Prepared depth indexes in {LOCAL_CONTOUR_INDEX_DIR}")
