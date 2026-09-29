/* eslint-disable react-hooks/set-state-in-effect -- moved as-is from DuckUITable,
   where the compiler rules skipped these effects; they reset column state when
   `data` changes and rewriting them is out of scope for the split. */
import React, { useState, useEffect } from "react";
import type { ColumnSizingState } from "@tanstack/react-table";
import { DEFAULT_COLUMN_WIDTH } from "./constants";
import type { DataRow } from "./types";
import { calculateOptimalWidth } from "./utils";

/**
 * Column visibility and width state. The three effects keep their original
 * relative order: they write the same state, so the last write wins.
 */
export function useColumnState(data: DataRow[]) {
  const [enabledColumns, setEnabledColumns] = useState<Record<string, boolean>>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [userResizedColumns, setUserResizedColumns] = useState<Record<string, number>>({});

  // Initialize/Update enabled columns when data changes
  useEffect(() => {
    if (data && data.length > 0 && data[0]) {
      const allKeys = Object.keys(data[0]);
      const initialEnabledCols = allKeys.reduce(
        (acc, key) => {
          acc[key] = enabledColumns[key] === undefined ? true : enabledColumns[key];
          return acc;
        },
        {} as Record<string, boolean>
      );
      setEnabledColumns(initialEnabledCols);

      const validUserResized: Record<string, number> = {};
      allKeys.forEach((key) => {
        if (userResizedColumns[key] !== undefined) {
          validUserResized[key] = userResizedColumns[key];
        }
      });
      setUserResizedColumns(validUserResized);
    } else {
      setEnabledColumns({});
      setUserResizedColumns({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]); // Keep enabledColumns and userResizedColumns out to preserve user settings

  // Effect to initialize columnSizing or update it when userResizedColumns change
  useEffect(() => {
    if (data && data.length > 0 && data[0]) {
      const newSizingState: ColumnSizingState = {};
      Object.keys(data[0]).forEach((key) => {
        newSizingState[key] =
          userResizedColumns[key] !== undefined ? userResizedColumns[key] : DEFAULT_COLUMN_WIDTH; // Use default width
      });
      if (JSON.stringify(columnSizing) !== JSON.stringify(newSizingState)) {
        setColumnSizing(newSizingState);
      }
    } else if (Object.keys(columnSizing).length > 0) {
      setColumnSizing({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, userResizedColumns]); // columnSizing itself should not be a direct dependency here to avoid loops

  // Auto-size columns when data changes
  useEffect(() => {
    if (data && data.length > 0 && data[0]) {
      const newSizing: ColumnSizingState = {};
      const keys = Object.keys(data[0]);

      keys.forEach((key) => {
        newSizing[key] = calculateOptimalWidth(data, key);
      });

      setColumnSizing(newSizing);
      setUserResizedColumns(newSizing);
    }
  }, [data]); // Trigger when data changes

  const handleColumnSizeChange = (updater: React.SetStateAction<ColumnSizingState>) => {
    const newSizingFromTable = typeof updater === "function" ? updater(columnSizing) : updater;
    setColumnSizing(newSizingFromTable);
    setUserResizedColumns(newSizingFromTable);
  };

  const toggleColumnVisibility = (columnId: string) => {
    setEnabledColumns((prev) => ({ ...prev, [columnId]: !prev[columnId] }));
  };

  const toggleAllColumns = (value: boolean) => {
    if (!data || !data.length || !data[0]) return;
    setEnabledColumns(
      Object.keys(data[0]).reduce(
        (acc, key) => {
          acc[key] = value;
          return acc;
        },
        {} as Record<string, boolean>
      )
    );
  };

  return {
    enabledColumns,
    columnSizing,
    userResizedColumns,
    setUserResizedColumns,
    handleColumnSizeChange,
    toggleColumnVisibility,
    toggleAllColumns,
  };
}
