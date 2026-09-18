import { clip } from "@paladin/utils"
import { docgenText } from "./docgenSymbols"

const text = `
@mathpen/manim
@mathpen/qgen

use Document and Grid and generateLongArithmetic

to implement a class Worksheet

class Worksheet extends Document {

	layout() {
	  
	  return [

	  ]
	}
	Q5() {
	  return new Rectangle()
	}
	Q6() {
	  return ...
	}

	E1() {
	  // E stands for Example and Q stands for Question
	}

}

will need to implement 





`

const markdown = await docgenText(text)
// console.log(markdown)
clip(markdown)
