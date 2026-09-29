import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DUCKDB_TYPES } from "./constants";
import type { SchemaColumn } from "./types";

export interface SchemaEditorProps {
  schemaColumns: SchemaColumn[];
  isSchemaCustomizing: boolean;
  setIsSchemaCustomizing: (customizing: boolean) => void;
  handleToggleColumn: (originalName: string) => void;
  handleRenameColumn: (originalName: string, newName: string) => void;
  handleChangeColumnType: (originalName: string, type: string) => void;
}

/** Column include/rename/type editor shown under the URL preview. */
const SchemaEditor: React.FC<SchemaEditorProps> = ({
  schemaColumns,
  isSchemaCustomizing,
  setIsSchemaCustomizing,
  handleToggleColumn,
  handleRenameColumn,
  handleChangeColumnType,
}) => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-base">Schema Customization</h4>
              <p className="text-sm text-muted-foreground">
                Customize column names, types, and visibility before importing
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSchemaCustomizing(!isSchemaCustomizing)}
            >
              {isSchemaCustomizing ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-2" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-2" />
                  Customize
                </>
              )}
            </Button>
          </div>

          {isSchemaCustomizing && (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left w-12">Include</th>
                      <th className="p-2 text-left">Original Name</th>
                      <th className="p-2 text-left">New Name</th>
                      <th className="p-2 text-left w-48">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {schemaColumns.map((col) => (
                      <tr key={col.originalName} className={!col.included ? "opacity-50" : ""}>
                        <td className="p-2">
                          <Checkbox
                            checked={col.included}
                            onCheckedChange={() => handleToggleColumn(col.originalName)}
                          />
                        </td>
                        <td className="p-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {col.originalName}
                          </code>
                        </td>
                        <td className="p-2">
                          <Input
                            value={col.newName}
                            onChange={(e) => handleRenameColumn(col.originalName, e.target.value)}
                            disabled={!col.included}
                            className="h-8 text-xs"
                            placeholder="Column name"
                          />
                        </td>
                        <td className="p-2">
                          <Select
                            value={col.type}
                            onValueChange={(value) =>
                              handleChangeColumnType(col.originalName, value)
                            }
                            disabled={!col.included}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DUCKDB_TYPES.map((type) => (
                                <SelectItem key={type} value={type} className="text-xs">
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-3 bg-muted/50 text-xs text-muted-foreground">
                <p>
                  {schemaColumns.filter((col) => col.included).length} of {schemaColumns.length}{" "}
                  columns will be imported
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SchemaEditor;
