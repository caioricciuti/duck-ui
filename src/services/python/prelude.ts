/**
 * Python source run once when a kernel starts. Defines the helpers cells see
 * (`sql`, `sql_async`) and the runner the worker calls for each cell.
 *
 * It talks to the worker through the `_duckui_bridge` JS module, which the
 * worker registers before running this:
 *   sql_sync(query, prefer)  -> {format, bytes, truncated}   (blocks)
 *   sql_async(query, prefer) -> Promise of the same
 *   sync_available           -> bool (cross-origin isolated)
 *   arrow_available()        -> bool (pyarrow loaded)
 *
 * Heavy imports (pandas, pyarrow, matplotlib) stay inside functions so a cell
 * that never touches them never pays for them.
 */
export const PYTHON_PRELUDE = String.raw`
import os as _os
_os.environ.setdefault("MPLBACKEND", "Agg")

import sys as _sys
import json as _json
import warnings as _warnings

_warnings.filterwarnings("ignore", message=".*non-interactive.*")

import _duckui_bridge


def _duckui_frame(res):
    fmt = res.format
    data = bytes(res.bytes.to_py())
    if fmt == "error":
        raise RuntimeError(data.decode("utf-8", "replace"))
    if res.truncated:
        _warnings.warn("sql(): result truncated at the row limit set in Settings", stacklevel=3)
    import pandas as pd
    if fmt == "arrow":
        import pyarrow as pa
        return pa.ipc.open_stream(data).read_pandas()
    obj = _json.loads(data.decode("utf-8"))
    columns = obj.get("columns", [])
    frame = pd.DataFrame({i: col for i, col in enumerate(obj.get("data", []))})
    if len(columns) == 0:
        return pd.DataFrame()
    frame.columns = columns
    return frame


def _duckui_prefer():
    return "arrow" if _duckui_bridge.arrow_available() else "json"


def sql(query):
    """Run SQL on the notebook's active connection; returns a pandas DataFrame."""
    if not _duckui_bridge.sync_available:
        raise RuntimeError(
            "sql() needs a cross-origin isolated page; use: df = await sql_async(query)"
        )
    prefer = _duckui_prefer()
    res = _duckui_bridge.sql_sync(str(query), prefer)
    try:
        return _duckui_frame(res)
    except RuntimeError:
        raise
    except Exception:
        if prefer != "arrow":
            raise
        # A type pyarrow cannot read: ask again as plain JSON.
        return _duckui_frame(_duckui_bridge.sql_sync(str(query), "json"))


async def sql_async(query):
    """Awaitable variant of sql(); works without cross-origin isolation."""
    prefer = _duckui_prefer()
    res = await _duckui_bridge.sql_async(str(query), prefer)
    try:
        return _duckui_frame(res)
    except RuntimeError:
        raise
    except Exception:
        if prefer != "arrow":
            raise
        return _duckui_frame(await _duckui_bridge.sql_async(str(query), "json"))


def _duckui_format_exc(exc):
    import traceback
    frames = [
        f for f in traceback.extract_tb(exc.__traceback__) if f.filename == "<cell>"
    ]
    lines = []
    if frames:
        lines.append("Traceback (most recent call last):\n")
        lines.extend(traceback.format_list(frames))
    lines.extend(traceback.format_exception_only(type(exc), exc))
    return "".join(lines).rstrip()


def _duckui_describe(value, row_cap):
    pd = _sys.modules.get("pandas")
    if pd is not None:
        if isinstance(value, pd.Series):
            value = value.to_frame()
        if isinstance(value, pd.DataFrame):
            head = value.head(row_cap)
            if not isinstance(head.index, pd.RangeIndex):
                head = head.reset_index()
            head = head.copy()
            head.columns = [str(c) for c in head.columns]
            return {
                "table": {
                    "json": head.to_json(
                        orient="split", date_format="iso", default_handler=str, index=False
                    ),
                    "dtypes": [str(t) for t in head.dtypes],
                    "rowCount": int(len(value)),
                }
            }
    return {"text": repr(value)}


def _duckui_figures(cap):
    plt = _sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return []
    import io
    import base64
    images = []
    try:
        for num in plt.get_fignums()[:cap]:
            fig = plt.figure(num)
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight")
            images.append(base64.b64encode(buf.getvalue()).decode("ascii"))
    finally:
        plt.close("all")
    return images


_duckui_ns = {"__name__": "__main__", "sql": sql, "sql_async": sql_async}


async def _duckui_run(code, row_cap, figure_cap):
    from pyodide.code import eval_code_async
    out = {"text": None, "table": None, "images": [], "error": None}
    try:
        value = await eval_code_async(code, globals=_duckui_ns, filename="<cell>")
        if value is not None:
            try:
                out.update(_duckui_describe(value, row_cap))
            except Exception:
                out["text"] = repr(value)
    except BaseException as exc:
        out["error"] = _duckui_format_exc(exc)
    try:
        out["images"] = _duckui_figures(figure_cap)
    except Exception as exc:
        _sys.stderr.write("Could not render figures: %s\n" % exc)
    _sys.stdout.flush()
    _sys.stderr.flush()
    return _json.dumps(out, default=str)
`;
