"""Keeps NOAA Great Lakes data downloaded in the background.

NOAA runs every Great Lakes model at 00, 06, 12 and 18 UTC with a 120-hour
hourly forecast. The last forecast file of a run reaches the CO-OPS THREDDS
server a consistent delay after the cycle time (measured October 2026; see
``PUBLISH_DELAY_MINUTES``). Between runs nothing new is published, but "Now"
moves to the next hourly frame of the same run, so the refresher:

* checks for new files every 5 minutes while a cycle is being published
  (every 30 minutes otherwise), independently of downloads and drawing,
* downloads every forecast choice ("Now", 6, 12, 24, 48 h) for every lake, at
  every depth, whenever a run is published or the current hour changes, and
  precomputes their thermoclines,
* draws the map layers (all lakes, full detail) for each forecast choice, and
  for "Now" at every depth level down to about 100 ft, and stores them on
  disk, so opening, panning, or changing depth does not wait for drawing,
* downloads the forecast animation's frames (every 3 hours on the UTC clock
  out to 48 h; the same files all through a run) and draws each layer's
  surface animation on its shared colour scale,
* downloads the static model meshes, water masks, and depth grids once,
* checks the hourly NOAA wave model (GLWU) every 5 minutes and downloads and
  draws each wave forecast choice and animation frame when a cycle arrives or
  "Now" moves on.

Only one process refreshes (gunicorn starts several workers); the others read
the shared disk cache. If the leader exits, another worker takes over.
"""

from __future__ import annotations

import hashlib
import logging
import multiprocessing
import os
import threading
import time
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, ThreadPoolExecutor, wait
from concurrent.futures.process import BrokenProcessPool
from datetime import datetime, timezone

from . import great_lakes_cache as cache
from . import great_lakes_service as service
from . import great_lakes_upwelling as upwelling
from . import great_lakes_waves as waves

CYCLE_HOURS = (0, 6, 12, 18)
CYCLE_SECONDS = 6 * 3600
# Minutes after the cycle time when the run's final (f120) file appears.
PUBLISH_DELAY_MINUTES = {"LEOFS": 155, "LOOFS": 167, "LMHOFS": 201, "LSOFS": 205}
# NOAA schedules Great Lakes computation 1 h 50 m after each cycle. Check
# throughout publication, rather than only around the final f120 file.
RUN_START_DELAY_SECONDS = 110 * 60
WINDOW_AFTER_SECONDS = 2 * 3600
FAST_RUN_CHECK_SECONDS = 5 * 60
SLOW_RUN_CHECK_SECONDS = 30 * 60
RETRY_SECONDS = 5 * 60
LOOP_SECONDS = 60
STATUS_FILE = "status.json"
# The browser always requests every lake at this resolution (see
# GREAT_LAKES_LAYER_RESOLUTION in great-lakes-conditions.js).
MAP_RESOLUTION = 512
# "Now" is pre-drawn at every model depth level down to about 100 ft.
PREDRAW_MAX_DEPTH_METERS = 30.0
# Forecast animations kept drawn at the surface (waves are kept with the wave model).
ANIMATED_MODEL_LAYERS = ("temperature", "thermocline", "currents", "upwelling")
# The wave model runs hourly, so its newest cycle is checked this often.
WAVE_RUN_CHECK_SECONDS = 5 * 60
LOCK_FILE = "refresher.lock"

logger = logging.getLogger(__name__)


def preparation_workers() -> int:
    """Use up to four CPU processes unless explicitly configured."""
    try:
        return max(1, int(os.environ.get("GREAT_LAKES_PREPARE_WORKERS", str(min(4, os.cpu_count() or 1)))))
    except ValueError:
        return 1


def _configure_preparation(cache_directory: str) -> None:
    cache.configure(cache_directory)


def _draw_view(kind: str, offset: int, depth: float) -> None:
    """Small picklable job; desktop layers and URLs stay owned by this app."""
    from . import great_lakes_animation as animation

    if kind.startswith("animation:"):
        result = animation.prepare(kind.split(":", 1)[1], depth)
        if not result.get("frames") or not all(frame.get("available") for frame in result["frames"]):
            raise RuntimeError("Animation has unavailable frames")
    else:
        _require_all_lakes(animation.layer_payload(kind, offset, depth))


def _iso(epoch: float | None) -> str | None:
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")


def _require_all_lakes(payload: dict) -> None:
    missing = [item for item in payload.get("metadata", {}).get("models", []) if not item.get("available")]
    if missing:
        raise RuntimeError("; ".join(f"{item.get('model')}: {item.get('error')}" for item in missing))


def expected_publication(model: str, run: dict | None, now: float) -> float:
    """Expected completion of a publishing cycle, or the cycle after a complete run."""
    delay = PUBLISH_DELAY_MINUTES.get(model, 210) * 60
    if run and run.get("cycleEpoch"):
        return float(run["cycleEpoch"]) + (0 if run.get("complete") is False else CYCLE_SECONDS) + delay
    cycle = now - now % CYCLE_SECONDS
    candidate = cycle + delay
    return candidate if candidate > now - WINDOW_AFTER_SECONDS else candidate + CYCLE_SECONDS


def in_publication_window(runs: dict[str, dict], now: float) -> bool:
    for model in service.MODELS:
        expected = expected_publication(model, runs.get(model), now)
        start = expected - PUBLISH_DELAY_MINUTES.get(model, 210) * 60 + RUN_START_DELAY_SECONDS
        if start <= now <= expected + WINDOW_AFTER_SECONDS:
            return True
    return False


def data_status(models: tuple[str, ...] = service.MODELS, now: float | None = None) -> dict:
    """What the server is serving now and when NOAA should publish next."""
    now = time.time() if now is None else now
    runs = service.discovered_runs(models)
    result = {}
    for model in models:
        published = runs.get(model, {})
        run = service.select_forecast_run(published, 0, now)
        if not run.get("files"):
            result[model] = {"available": False, "error": run.get("error"), "nextRunExpectedAt": _iso(expected_publication(model, published, now))}
            continue
        hour = service.select_forecast_hour(run, 0, now)
        result[model] = {
            "available": True,
            "run": run["id"],
            "runTime": _iso(float(run["cycleEpoch"])),
            "nowForecastHour": hour,
            "nowValidTime": _iso(float(run["cycleEpoch"]) + hour * 3600),
            "nextRunExpectedAt": _iso(expected_publication(model, published, now)),
        }
    shared = cache.read_json(cache.path_for(STATUS_FILE)) or {}
    # The drawing versions are part of the key browsers and apps cache layers
    # under, so a change to how layers are drawn reaches them immediately.
    drawing = f"draw:{service.TEMPERATURE_RASTER_RENDER_VERSION}.{service.THERMOCLINE_RASTER_RENDER_VERSION}.{service.CURRENT_RENDER_VERSION}.{upwelling.UPWELLING_RENDER_VERSION}"
    version = "|".join([*(f"{model}:{item.get('run')}:{item.get('nowForecastHour')}" for model, item in result.items()), drawing])
    # A partial cycle can gain forecast/animation hours without changing its
    # "Now" file. Clients and manifests must also invalidate for those changes.
    if any("fallbacks" in run for run in runs.values()):
        version += "|coverage:" + hashlib.sha1(repr(_forecast_signature(runs, now)).encode()).hexdigest()[:16]
    wave_status = waves.wave_status(now)
    return {
        "generatedAt": _iso(now),
        "version": version,
        # Waves come from a separate hourly model, so the wave layer reloads
        # on its own version and the other layers are not refetched hourly.
        "wavesVersion": f"{wave_status.pop('version')}|draw:{waves.WAVE_RENDER_VERSION}",
        "models": result,
        "waves": wave_status,
        "refresher": shared if isinstance(shared, dict) else {},
    }


def _forecast_signature(runs: dict[str, dict], now: float) -> tuple:
    return tuple((offset, service.selected_data_key(runs, offset, now)) for offset in service.served_offsets(now))


class GreatLakesRefresher:
    def __init__(self, clock=time.time) -> None:
        self.clock = clock
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._work_thread: threading.Thread | None = None
        self._pool: ProcessPoolExecutor | None = None
        self._pool_workers = 0
        self._state_lock = threading.Lock()
        self._lock = cache.LeaderLock(cache.path_for(LOCK_FILE))
        self.next_run_check = 0.0
        self.warm_retry_at = 0.0
        self.warmed_signature: tuple | None = None
        self.static_warmed = False
        self.next_wave_check = 0.0
        self.wave_retry_at = 0.0
        self.waves_signature: tuple | None = None
        self.state: dict = {}

    def start(self) -> "GreatLakesRefresher":
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, name="great-lakes-refresher", daemon=True)
            self._thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
        # The loop retains leadership until preparation has stopped, so a
        # replacement cannot prune or write the same cache concurrently.
        if self._thread is None:
            self._close_drawing_pool()
            self._lock.release()

    def _loop(self) -> None:
        try:
            while not self._stop.is_set():
                if not self._lock.acquire():
                    self._stop.wait(LOOP_SECONDS)
                    continue
                try:
                    self.check_runs()
                    self.check_wave_run()
                    self._save_state()
                except Exception:
                    logger.exception("Great Lakes source discovery failed")
                if not self._stop.is_set() and (self._work_thread is None or not self._work_thread.is_alive()):
                    self._work_thread = threading.Thread(target=self._prepare, name="great-lakes-preparation", daemon=True)
                    self._work_thread.start()
                self._stop.wait(self.sleep_seconds())
        finally:
            if self._work_thread:
                self._work_thread.join()
            self._close_drawing_pool()
            self._lock.release()

    def _prepare(self) -> None:
        try:
            self.tick(check_sources=False)
        except Exception:
            logger.exception("Great Lakes background preparation failed")

    def sleep_seconds(self) -> float:
        now = self.clock()
        deadlines = [self.next_run_check, self.next_wave_check, now + LOOP_SECONDS]
        if self.warm_retry_at > now:
            deadlines.append(self.warm_retry_at)
        return max(1.0, min(deadlines) - now)

    def check_runs(self) -> None:
        """Discover publication progress without waiting for preparation."""
        now = self.clock()
        if now < self.next_run_check:
            return
        previous = {model: run.get("id") for model, run in service.discovered_runs().items()}
        runs = service.discovered_runs(refresh=True)
        for model, run in runs.items():
            if run.get("id") and run.get("id") != previous.get(model):
                logger.info("NOAA %s run %s is available", model, run["id"])
        with self._state_lock:
            self.state["lastRunCheck"] = _iso(now)
        self.next_run_check = self.clock() + (FAST_RUN_CHECK_SECONDS if in_publication_window(runs, now) else SLOW_RUN_CHECK_SECONDS)

    def check_wave_run(self) -> None:
        now = self.clock()
        if now >= self.next_wave_check:
            self._task("wave run check", lambda: waves.discovered_wave_run(refresh=True, now=now))
            self.next_wave_check = self.clock() + WAVE_RUN_CHECK_SECONDS

    def tick(self, *, check_sources: bool = True) -> None:
        from . import great_lakes_animation as animation  # Imports this module.

        # Waves first: they take seconds, while a GLOFS hour can take minutes,
        # and both move to the next hour around the same time.
        self.refresh_waves(check_source=check_sources)
        now = self.clock()
        if check_sources:
            self.check_runs()
        runs = service.discovered_runs()
        signature = _forecast_signature(runs, now)
        if signature != self.warmed_signature and now >= self.warm_retry_at:
            ok = True
            # "Now" first, so it is ready while the forecasts are prepared;
            # then the forecast choices; then the remaining animation frames.
            animation_only = [offset for offset in service.animation_offsets(now) if offset not in service.FORECAST_OFFSETS]
            for offset in service.FORECAST_OFFSETS:
                if self._stop.is_set():
                    return
                ok = self._warm(runs, offset) and ok
                ok = self._task(f"pre-drawn {offset} h views", lambda offset=offset: self.predraw(offset)) and ok
            for offset in animation_only:
                if self._stop.is_set():
                    return
                ok = self._warm(runs, offset) and ok
            ok = self._task("surface animations", self.prepare_animations) and ok
            if self._stop.is_set():
                return
            if ok:
                self.warmed_signature = signature
                with self._state_lock:
                    self.state["lastWarm"] = _iso(now)
                self.warm_retry_at = 0.0
                # Discovery can advance during preparation. Prune against a
                # fresh snapshot, retaining every run still used by any view.
                self.prune_model_cache(service.discovered_runs(), self.clock())
                self._task("old drawn views", service.prune_rendered)
                self._task("old animation scales", animation.prune)
            else:
                self.warm_retry_at = now + RETRY_SECONDS
        if not self.static_warmed:
            self.static_warmed = all(
                [self._task(f"{model} {kind} mesh", lambda model=model, kind=kind: service._model_mesh(model, kind))
                 for model in service.MODELS for kind in service.MODEL_POINT_KINDS]
                + [self._task(f"{model} bathymetry", lambda model=model: service._bathymetry_grid(model)) for model in service.MODELS]
            )
        with self._state_lock:
            self.state["updatedAt"] = _iso(self.clock())
        self._save_state()

    def refresh_waves(self, *, check_source: bool = True) -> None:
        """Keep the hourly wave model current: every forecast choice and animation frame downloaded and drawn."""
        from . import great_lakes_animation as animation  # Imports this module.

        now = self.clock()
        if check_source:
            self.check_wave_run()
        run = waves.known_run()
        if not run.get("id"):
            return
        signature = (run["id"], waves.select_wave_hour(run, 0, now))
        if signature == self.waves_signature or now < self.wave_retry_at:
            return
        if self._task("wave forecasts", lambda: waves.warm_wave_hours(service.served_offsets(now), now)):
            drawn = [self._task(f"pre-drawn {offset} h waves", lambda offset=offset: _require_all_lakes(waves.wave_rasters(offset, MAP_RESOLUTION, service.MODELS)))
                     for offset in service.FORECAST_OFFSETS]
            animation_ready = self._task("waves animation", lambda: animation.prepare("waves"))
            if all(drawn) and animation_ready:
                self.waves_signature = signature
                with self._state_lock:
                    self.state["lastWaveWarm"] = _iso(now)
                self.wave_retry_at = 0.0
                return
        self.wave_retry_at = now + RETRY_SECONDS

    def prune_model_cache(self, runs: dict[str, dict], now: float) -> None:
        for model, published in runs.items():
            selected: dict[str, tuple[dict, set[int]]] = {}
            for offset in service.served_offsets(now):
                run = service.select_forecast_run(published, offset, now)
                if run.get("files"):
                    _, hours = selected.setdefault(run["id"], (run, set()))
                    hours.add(service.select_forecast_hour(run, offset, now))
            if selected:
                # Keep the publishing run too, even before its "Now" is ready.
                cache.prune(cache.path_for("models", model), {*selected, published["id"]})
                for run, hours in selected.values():
                    service.prune_model_hours(model, run, hours)

    def _save_state(self) -> None:
        with self._state_lock:
            snapshot = {**self.state, "errors": dict(self.state.get("errors", {}))}
            try:
                cache.write_json(cache.path_for(STATUS_FILE), snapshot)
            except OSError:
                pass

    def predraw(self, offset: int = 0) -> None:
        """Draw the map layers for one forecast choice, exactly as the browser requests them.

        The map always shows every lake at full detail, so one drawing per
        layer serves any pan or zoom. "Now" is also drawn at each depth level
        down to PREDRAW_MAX_DEPTH_METERS; other times are drawn at the surface.
        """
        models = service.MODELS
        depths = [0.0]
        if offset == 0:
            depths = [depth for depth in service.depth_levels(models) if depth <= PREDRAW_MAX_DEPTH_METERS] or [0.0]
        tasks = [(layer, offset, depth) for depth in depths for layer in ("temperature", "currents")]
        tasks.extend((layer, offset, 0.0) for layer in ("thermocline", "upwelling"))
        self._draw_tasks(tasks, f"{offset} h maps")

    def _warm(self, runs: dict[str, dict], offset: int = 0) -> bool:
        models = [model for model, run in runs.items() if run.get("files")]
        if not models or self._stop.is_set():
            return not self._stop.is_set()

        def warm(model):
            return self._task(f"{model} +{offset} h", lambda: service.warm_model_hour(model, offset))

        # At most four independent NOAA requests; each lake's temperature,
        # thermocline, and velocity preparation stays in order.
        with ThreadPoolExecutor(max_workers=min(4, len(models)), thread_name_prefix="great-lakes-download") as pool:
            results = list(pool.map(warm, models))
        return all(results)

    def _task(self, label: str, action) -> bool:
        started = time.monotonic()
        try:
            action()
        except Exception as error:
            logger.warning("Great Lakes refresh of %s failed: %s", label, error)
            with self._state_lock:
                self.state.setdefault("errors", {})[label] = f"{_iso(self.clock())}: {error}"
            return False
        with self._state_lock:
            self.state.setdefault("errors", {}).pop(label, None)
        logger.debug("Great Lakes refresh of %s took %.1fs", label, time.monotonic() - started)
        return True


    def _draw_tasks(self, tasks: list[tuple[str, int, float]], phase: str) -> None:
        """Bound outstanding jobs and use processes for CPU-heavy drawing."""
        workers = preparation_workers()
        if self._pool is not None and self._pool_workers != workers:
            self._close_drawing_pool()
        done = 0
        ok = True

        def record(task, action):
            nonlocal done, ok
            ok = self._task(f"{task[0]} +{task[1]} h at {task[2]:g} m", action) and ok
            done += 1
            with self._state_lock:
                self.state["preparation"] = {"phase": phase, "done": done, "total": len(tasks), "workers": workers}
            self._save_state()

        if workers == 1:
            for task in tasks:
                if self._stop.is_set():
                    return
                record(task, lambda task=task: _draw_view(*task))
        else:
            pool = self._drawing_pool(workers)
            broken = False
            try:
                remaining = iter(tasks)
                pending = {}
                while True:
                    while len(pending) < workers and not self._stop.is_set():
                        task = next(remaining, None)
                        if task is None:
                            break
                        pending[pool.submit(_draw_view, *task)] = task
                    if not pending:
                        break
                    finished, _ = wait(pending, return_when=FIRST_COMPLETED)
                    for future in finished:
                        broken = isinstance(future.exception(), BrokenProcessPool) or broken
                        record(pending.pop(future), future.result)
            except BrokenProcessPool:
                broken = True
                raise
            finally:
                if broken:
                    self._close_drawing_pool()
        if not ok:
            raise RuntimeError(f"Some {phase} failed; background preparation will retry")

    def _drawing_pool(self, workers: int) -> ProcessPoolExecutor:
        """Retain loaded metadata and volumes across forecast batches and hours."""
        if self._pool is None:
            # Spawn avoids inheriting gunicorn/refresher threads and their locks.
            self._pool = ProcessPoolExecutor(
                max_workers=workers, mp_context=multiprocessing.get_context("spawn"),
                initializer=_configure_preparation, initargs=(str(cache.cache_dir()),))
            self._pool_workers = workers
        return self._pool

    def _close_drawing_pool(self) -> None:
        pool, self._pool = self._pool, None
        self._pool_workers = 0
        if pool is not None:
            pool.shutdown(wait=True, cancel_futures=True)

    def prepare_animations(self) -> None:
        """Prepare the desktop's existing surface animation selection."""
        self._draw_tasks([(f"animation:{layer}", 0, 0.0) for layer in ANIMATED_MODEL_LAYERS], "animations")
