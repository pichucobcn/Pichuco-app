import { db } from "../db";

export async function getSettings() {
  return (
    (await db.restaurantSettings.findUnique({ where: { id: "default" } })) ??
    (await db.restaurantSettings.create({
      data: { id: "default", closedDays: [1], services: ["13:00-15:30", "19:30-23:30"] },
    }))
  );
}

export type Settings = Awaited<ReturnType<typeof getSettings>>;
