/*
- action: deprecateFile, args: ['recipe.ts']
*/

/* src/recipe/recipe.ts */

export type Recipe = { name: string; grams: number }
export const defaultRecipe: Recipe = { name: "soup", grams: 500 }
export const renderRecipe = (recipe: Recipe) => `${recipe.name} (${recipe.grams}g)`
export const scaleRecipe = (recipe: Recipe, by: number) => ({ ...recipe, grams: recipe.grams * by })

/* src/recipe/card.ts */

import { renderRecipe, type Recipe } from "./recipe"

export const RecipeCard = (recipe: Recipe) => `<div>${renderRecipe(recipe)}</div>`

/* src/recipe/units.ts */

export const toGrams = (ounces: number) => ounces * 28.35

/* src/recipe/index.ts */

export * from "./recipe"
export { RecipeCard } from "./card"
export { toGrams } from "./units"

/* src/layout/grid.ts */

export const Grid = (cells: string[]) => cells.join(" | ")
export const Stack = (rows: string[]) => rows.join("\n")

/* src/layout/index.ts */

import { Stack } from "./grid"
import { defaultRecipe } from "../recipe/recipe"

export * from "./grid"
export { type Recipe, renderRecipe as render } from "../recipe/recipe"
export { Stack as Column, defaultRecipe as fallback }

/* src/pages/recipe-page.ts */

import { RecipeCard, defaultRecipe } from "../recipe"

export const RecipePage = () => RecipeCard(defaultRecipe)

/* src/pages/units-page.ts */

import { toGrams } from "../recipe"

export const UnitsPage = () => `1oz = ${toGrams(1)}g`

/* src/pages/home.ts */

import { Grid, render } from "../layout"

export const Home = () => Grid(["pasta", "salad", "soup"])

/* src/pages/index.ts */

export * from "./home"
export * from "./recipe-page"
export * from "./units-page"

/* src/print.ts */

import * as recipe from "./recipe/recipe"

export const printRecipe = (r: recipe.Recipe) => console.log(recipe.renderRecipe(r))

/* src/app.ts */

import { Column } from "./layout"
import { Home } from "./pages"

export const app = () => Column([Home()])
