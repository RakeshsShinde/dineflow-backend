import { Response } from "express";
import prisma from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { RestaurantStatus } from "@prisma/client";

/**
 * Super Admin Endpoint: Get list of all restaurants (Filter by status: PENDING, APPROVED, REJECTED)
 */
export const getRestaurants = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const status = req.query.status as RestaurantStatus | undefined;

  const restaurants = await prisma.restaurant.findMany({
    where: status ? { status } : {},
    include: {
      users: {
        where: { role: "ADMIN" },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          users: true,
          tables: true,
          categories: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    count: restaurants.length,
    restaurants,
  });
});

/**
 * Super Admin Endpoint: Update restaurant approval status (APPROVED or REJECTED)
 */
export const updateRestaurantStatus = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const restaurantId = req.params.id as string;
  const { status } = req.body as { status: RestaurantStatus };

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
  });

  if (!restaurant) {
    throw new AppError("Restaurant not found", 404);
  }

  const updatedRestaurant = await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { status },
  });

  res.status(200).json({
    success: true,
    message: `Restaurant '${restaurant.name}' status updated to ${status} successfully`,
    restaurant: updatedRestaurant,
  });
});
