"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkoutLogger } from "@/components/fitness/workout-logger";
import { RoutineManager } from "@/components/fitness/routine-manager";
import { BodyMetrics } from "@/components/fitness/body-metrics";
import { StatsDashboard } from "@/components/fitness/stats-dashboard";

export function FitnessView() {
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-3 text-2xl font-bold">피트니스</h1>
      <Tabs defaultValue="log">
        <TabsList className="w-full">
          <TabsTrigger value="log">기록</TabsTrigger>
          <TabsTrigger value="routines">루틴</TabsTrigger>
          <TabsTrigger value="body">체성분</TabsTrigger>
          <TabsTrigger value="stats">통계</TabsTrigger>
        </TabsList>
        <TabsContent value="log" className="mt-4">
          <WorkoutLogger />
        </TabsContent>
        <TabsContent value="routines" className="mt-4">
          <RoutineManager />
        </TabsContent>
        <TabsContent value="body" className="mt-4">
          <BodyMetrics />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <StatsDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
