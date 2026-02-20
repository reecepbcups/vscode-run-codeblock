compile:
    npm run compile

build: compile
    vsce package

install: build
    code --install-extension run-code-block-*.vsix
