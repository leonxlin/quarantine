// Portions of this code are from
// https://github.com/brendankenny/libtess.js/blob/gh-pages/examples/simple_triangulation/triangulate.js

// SGI FREE SOFTWARE LICENSE B (Version 2.0, Sept. 18, 2008)
// Copyright 2000, Silicon Graphics, Inc. All Rights Reserved.
// Copyright 2012, Google Inc. All Rights Reserved.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice including the dates of first publication and
// either this permission notice or a reference to http://oss.sgi.com/projects/FreeB/
// shall be included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
// SILICON GRAPHICS, INC. BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
// WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
// IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// Except as contained in this notice, the name of Silicon Graphics, Inc. shall not
// be used in advertising or otherwise to promote the sale, use or other dealings
// in this Software without prior written authorization from Silicon Graphics, Inc.

// Original Code. The Original Code is: OpenGL Sample Implementation,
// Version 1.2.1, released January 26, 2000, developed by Silicon Graphics,
// Inc. The Original Code is Copyright (c) 1991-2000 Silicon Graphics, Inc.
// Copyright in any portions created by third parties is as indicated
// elsewhere herein. All Rights Reserved.

// Need to specify the "cat.js" version since the default minified version
// munges the names of the GluMesh internals that we want to use.
import libtess from "libtess/libtess.cat.js";

export function initTesselator(
  meshCallback: (mesh: libtess.GluMesh) => void
): libtess.GluTesselator {
  // function called for each vertex of tesselator output
  function vertexCallback(data, polyVertArray) {
    // console.log(data[0], data[1]);
    polyVertArray[polyVertArray.length] = data[0];
    polyVertArray[polyVertArray.length] = data[1];
  }
  function begincallback(type) {
    if (type !== libtess.primitiveType.GL_TRIANGLES) {
      console.log("expected TRIANGLES but got type: " + type);
    }
  }
  function errorcallback(errno) {
    console.log("error callback");
    console.log("error number: " + errno);
  }
  // callback for when segments intersect and must be split
  function combinecallback(coords, data, weight) {
    // console.log('combine callback');
    return [coords[0], coords[1], coords[2]];
  }
  function edgeCallback(flag) {
    // don't really care about the flag, but need no-strip/no-fan behavior
    // console.log('edge flag: ' + flag);
  }

  const tessy = new libtess.GluTesselator();
  tessy.gluTessProperty(
    libtess.gluEnum.GLU_TESS_WINDING_RULE,
    libtess.windingRule.GLU_TESS_WINDING_POSITIVE
  );
  tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_VERTEX_DATA, vertexCallback);
  tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_BEGIN, begincallback);
  tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_ERROR, errorcallback);
  tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_COMBINE, combinecallback);
  tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_EDGE_FLAG, edgeCallback);
  tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_MESH, meshCallback);

  return tessy;
}
