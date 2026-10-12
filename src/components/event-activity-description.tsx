"use client";
import {useState} from "react";
import {RichTextField} from "@/components/rich-text-field";
export function EventActivityDescription({initialValue}:{initialValue:string}){
 const[value,setValue]=useState(initialValue);
 return <RichTextField name="description" label="Uitleg" value={value} onChange={setValue}/>;
}
