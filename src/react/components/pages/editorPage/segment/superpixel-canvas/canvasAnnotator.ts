import { Annotation, AnnotationTag, number2SPId } from "./superpixelCanvas";
const Snap = require("snapsvg-cjs");

export const annotateCanvas = (annotatedData: Annotation[], defaultColor: string, defaultOpacity: number,
    defaultLineWidth: number, annotatedOpacity: number ) => {
    if (annotatedData){
        annotatedData.forEach( (annotation: Annotation) => {
            const key = annotation.index!;
            const superpixel = Snap("#" + number2SPId(key));
            const superpixel_attr = superpixel.attr();
            if (annotation.tag !== superpixel_attr.tag){
                superpixel.attr({ id: number2SPId(key), key, stroke: "white", strokeWidth: defaultLineWidth,
                fill: annotation.color === AnnotationTag.EMPTY ? defaultColor : annotation.color,
                opacity: annotation.tag === AnnotationTag.EMPTY ? defaultOpacity : annotatedOpacity,
                tag: annotation.tag,
                name: annotation.color,
                });
            }
        });
    }
}

export const importAnnotatedData = (json: any): Annotation[] => {
    const annotatedData: Annotation[] = [];
    for (const label in json["segmentation"]){
        const foundElement = json["categories"].filter( (e: any) => e.name === label);
        const color = foundElement.length > 0 ? foundElement[0].color : "#000000";
        json["segmentation"][label].forEach((element: number) => {
            annotatedData.push(new Annotation(label, color, element));
        });
    }
    return annotatedData;   
}