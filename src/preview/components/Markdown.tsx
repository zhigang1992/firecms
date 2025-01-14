import React from "react";

import MarkdownPreview from "@uiw/react-markdown-preview";

type MarkdownProps = {
    source: string
};

/**
 * @category Preview components
 */
export default function Markdown({
                                     source
                                 }: MarkdownProps) {
    return <MarkdownPreview source={typeof source === "string" ? source : ""}
                            style={{
                                fontSize: "inherit",
                                lineHeight: "inherit",
                                fontFamily: "inherit"
                            }}
                            components={{
                                a: (props) => <a {...props}
                                                 onClick={(e) => e.stopPropagation()}
                                                 target="_blank">{props.children}</a>
                            }}
    />;
}

