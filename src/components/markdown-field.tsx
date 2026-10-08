"use client";

import {useState} from "react";
import {Streamdown} from "streamdown";
import {RichTextField} from "./rich-text-field";

type MarkdownFieldProps={name:string;defaultValue?:string|null;rows?:number;placeholder?:string;label?:string};

// Existing forms keep their Markdown contract and get the same visual editor.
export function MarkdownField({name,defaultValue="",rows=6,placeholder,label}:MarkdownFieldProps){
 const [value,setValue]=useState(defaultValue??"");
 return <RichTextField name={name} value={value} onChange={setValue} rows={rows} placeholder={placeholder} label={label}/>;
}

export function MarkdownContent({children}:{children?:string|null}){
 if(!children)return null;
 return <div className="markdown-content"><Streamdown mode="static" controls={false}>{children}</Streamdown></div>;
}
