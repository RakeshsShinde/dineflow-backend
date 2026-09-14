import { z } from "zod";
import { RestaurantStatus } from "@prisma/client";

export const updateRestaurantStatusSchema = z.object({
  status: z.enum([RestaurantStatus.APPROVED, RestaurantStatus.REJECTED], {
    message: "Status is required and must be either APPROVED or REJECTED",
  }),
});

export const restaurantIdParamSchema = z.object({
  id: z.string().uuid("Invalid Restaurant UUID"),
});
