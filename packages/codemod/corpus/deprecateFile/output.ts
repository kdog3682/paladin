/// src/recipe/recipe.ts is deleted: 'recipe.ts' resolves to it as the only file of that name

/// src/recipe/card.ts is deleted: it uses renderRecipe and Recipe

/* src/recipe/units.ts */

/// untouched: doesn't import recipe.ts, and its own directory's barrel going away doesn't delete it
export const toGrams = (ounces: number) => ounces * 28.35

/// src/recipe/index.ts is deleted: a barrel in the same directory as recipe.ts is part of its group.
/// Everything it exported is lost to its importers, toGrams included.

/* src/layout/grid.ts */

export const Grid = (cells: string[]) => cells.join(" | ")
export const Stack = (rows: string[]) => rows.join("\n")

/* src/layout/index.ts */

/// a barrel in another directory: kept, only the recipe exports are commented out
import { Stack } from "./grid"
// import { defaultRecipe } from "../recipe/recipe"

export * from "./grid"
// export { type Recipe, renderRecipe as render } from "../recipe/recipe"
/// a mixed declaration is split: the surviving specifier stays, the lost one is commented below it
export { Stack as Column }
// export { defaultRecipe as fallback }

/// src/pages/recipe-page.ts is deleted: it uses RecipeCard and defaultRecipe from the deleted recipe barrel

/// src/pages/units-page.ts is deleted: it uses toGrams through the deleted recipe barrel.
/// units.ts itself survives, so this import could have been pointed at "../recipe/units" instead

/* src/pages/home.ts */

/// imports render but never uses it, so the file is kept and only that binding is commented out
import { Grid } from "../layout"
// import { render } from "../layout"

export const Home = () => Grid(["pasta", "salad", "soup"])

/* src/pages/index.ts */

export * from "./home"
// export * from "./recipe-page"
// export * from "./units-page"

/// src/print.ts is deleted: its namespace import of recipe.ts is used (recipe.Recipe, recipe.renderRecipe)

/* src/app.ts */

/// untouched: Column and Home are still exported
import { Column } from "./layout"
import { Home } from "./pages"

export const app = () => Column([Home()])
