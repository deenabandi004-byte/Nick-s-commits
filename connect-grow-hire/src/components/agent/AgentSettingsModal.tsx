// Agent settings slide-over - opens from gear icon on dashboard.

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAgentLifecycle } from "@/hooks/useAgent";
import type { AgentConfig } from "@/services/agent";

export function AgentSettingsModal({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AgentConfig;
}) {
  const lifecycle = useAgentLifecycle();

  const [local, setLocal] = useState({
    weeklyContactTarget: config.weeklyContactTarget,
    creditBudgetPerWeek: config.creditBudgetPerWeek,
    approvalMode: config.approvalMode,
    sendMode: config.sendMode,
    followUpEnabled: config.followUpEnabled,
    followUpDays: config.followUpDays,
    maxFollowUps: config.maxFollowUps,
    enableJobDiscovery: config.enableJobDiscovery ?? true,
    enableHiringManagers: config.enableHiringManagers ?? true,
    enableCompanyDiscovery: config.enableCompanyDiscovery ?? true,
  });

  const save = (updates: Partial<AgentConfig>) => {
    lifecycle.updateConfig.mutate(updates);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Agent Settings</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Volume */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Volume</h3>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Weekly contact target: {local.weeklyContactTarget}
              </Label>
              <Slider
                min={1}
                max={15}
                step={1}
                value={[local.weeklyContactTarget]}
                onValueChange={([v]) => setLocal((p) => ({ ...p, weeklyContactTarget: v }))}
                onValueCommit={([v]) => save({ weeklyContactTarget: v })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Credit budget/week: {local.creditBudgetPerWeek}
              </Label>
              <Slider
                min={10}
                max={150}
                step={10}
                value={[local.creditBudgetPerWeek]}
                onValueChange={([v]) => setLocal((p) => ({ ...p, creditBudgetPerWeek: v }))}
                onValueCommit={([v]) => save({ creditBudgetPerWeek: v })}
              />
            </div>
          </div>

          {/* Features */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Features</h3>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Job discovery</Label>
              <Switch
                checked={local.enableJobDiscovery}
                onCheckedChange={(v) => {
                  setLocal((p) => ({ ...p, enableJobDiscovery: v }));
                  save({ enableJobDiscovery: v });
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Hiring manager outreach</Label>
              <Switch
                checked={local.enableHiringManagers}
                onCheckedChange={(v) => {
                  setLocal((p) => ({ ...p, enableHiringManagers: v }));
                  save({ enableHiringManagers: v });
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Company discovery</Label>
              <Switch
                checked={local.enableCompanyDiscovery}
                onCheckedChange={(v) => {
                  setLocal((p) => ({ ...p, enableCompanyDiscovery: v }));
                  save({ enableCompanyDiscovery: v });
                }}
              />
            </div>
          </div>

          {/* Control */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Control</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Approval Mode</p>
                <p className="text-xs text-muted-foreground">
                  {local.approvalMode === "review_first"
                    ? "Review actions before execution"
                    : "Agent acts automatically"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const next = local.approvalMode === "review_first" ? "autopilot" : "review_first";
                  setLocal((p) => ({ ...p, approvalMode: next }));
                  save({ approvalMode: next });
                }}
              >
                {local.approvalMode === "review_first" ? "Switch to Autopilot" : "Switch to Review"}
              </Button>
            </div>
          </div>

          {/* Follow-ups */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Follow-ups</h3>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Enable follow-ups</Label>
              <Switch
                checked={local.followUpEnabled}
                onCheckedChange={(v) => {
                  setLocal((p) => ({ ...p, followUpEnabled: v }));
                  save({ followUpEnabled: v });
                }}
              />
            </div>
            {local.followUpEnabled && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Follow up after {local.followUpDays} days
                  </Label>
                  <Slider
                    min={3}
                    max={14}
                    step={1}
                    value={[local.followUpDays]}
                    onValueChange={([v]) => setLocal((p) => ({ ...p, followUpDays: v }))}
                    onValueCommit={([v]) => save({ followUpDays: v })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Max follow-ups per contact: {local.maxFollowUps}
                  </Label>
                  <Slider
                    min={1}
                    max={3}
                    step={1}
                    value={[local.maxFollowUps]}
                    onValueChange={([v]) => setLocal((p) => ({ ...p, maxFollowUps: v }))}
                    onValueCommit={([v]) => save({ maxFollowUps: v })}
                  />
                </div>
              </>
            )}
          </div>

          {/* Danger zone */}
          <div className="space-y-3 pt-4 border-t">
            <h3 className="text-sm font-medium text-red-600">Danger Zone</h3>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => {
                lifecycle.stop.mutate();
                onOpenChange(false);
              }}
              disabled={lifecycle.stop.isPending}
            >
              Stop Agent
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
