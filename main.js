class XHR{
    call(method,url,data){
        return new Promise((resolve,reject) => {
            var xhttp = new XMLHttpRequest()
            xhttp.onreadystatechange = function() {
              if (this.readyState == 4){
                if(this.status == 200) {
                    var data = JSON.parse(this.responseText)
                    resolve(data)
                } else {
                    reject(this.status+": "+this.responseText)
                }
              }
            }
            xhttp.open(method, url, true)
            data ? xhttp.send(data) : xhttp.send()
        })
    }
    async get(url){
        return await this.call("GET",url)
    }
    async post(url,data){
        return await this.call("POST",url,data)
    }
}

function startWaiting(){
    document.getElementById('loading').removeAttribute('hidden')
    document.querySelectorAll('input').forEach(n => n.setAttribute('disabled',true))
}

function stopWaiting(){
    document.getElementById('loading').setAttribute('hidden',true)
    document.querySelectorAll('input').forEach(n => n.removeAttribute('disabled'))
}

async function requestAllCourses(){
    var xhr = new XHR()
    var bookmark = null
    var hasMoreItems = true
    var courses = []
    startWaiting()
    while(hasMoreItems){
        var data = await xhr.get(`/d2l/api/lp/1.15/enrollments/myenrollments/?orgUnitTypeId=3${bookmark?'&Bookmark='+bookmark:''}`)
        
        bookmark = data.PagingInfo.Bookmark
        hasMoreItems = data.PagingInfo.HasMoreItems
        
        data.Items.forEach(course => {
            courses.push({
                code: course.OrgUnit.Code,
                id: course.OrgUnit.Id,
                name: course.OrgUnit.Name,
            })
        })
        console.log(bookmark)
    }
    stopWaiting()
    return courses
}

async function getCourses(){
    var courses = localStorage.courses
    if(!courses){
        courses = await requestAllCourses()
        localStorage.courses = d3.csvFormat(courses)
    } else {
        courses = d3.csvParse(courses)
    }
    return courses
}

function bucketify(courses){
    var bucket = {}
    courses.forEach(course => {
        // Starting off on the top level
        var level = bucket
        // Interpreting the course code format as a nested object structure
        var sections = course.code.split('.')
        // Scraping everthing that dosen't start with these
        if(["Bridged - Online","Online","Campus"].includes(sections[0])){
            // go through each section putting it into the right buckets
            sections.forEach(section => {
                // if it doesen't already exist add our data
                level[section] = level[section] || {data:course}
                // Move down a level
                level = level[section]
            })
        }
    })
    
    // need to remove the data attributes that are not on leaf nodes
    function cleanUp(bucket){
        if(Object.keys(bucket).length > 1){
            delete bucket.data
            Object.keys(bucket).forEach(key => cleanUp(bucket[key]))
        }
    }
    
    cleanUp(bucket)
    
    return bucket
}

function flatten(bucket,flattened){
    flattened = flattened || []
    if(bucket.data){
        flattened.push(bucket.data)
    } else {
        Object.keys(bucket).forEach(key => flatten(bucket[key],flattened))
    }
}

function createDropdown(bucket){
    function createOption(value,shown){
        var option = document.createElement('option')
        option.value = value
        option.innerHTML = shown
        return option
    }
    
    var select = document.createElement('select')
    
    select.appendChild(createOption("","--"))
    
    Object.keys(bucket).forEach(key => {
        select.appendChild(createOption(key,key))
    })
    
    return select
}

function createDownloadLink(data,fileName){ 
    var a = document.createElement("a")
    document.body.appendChild(a)
    a.innerHTML = fileName
    
    var csv = d3.csvFormat(data)
    var blob = new Blob([csv],{type:"octet/stream"})
    var url = window.URL.createObjectURL(blob)
    
    a.href = url
    a.download = fileName
}

async function main(){
    var courses = await getCourses()
    var bucket = bucketify(courses)
    console.log(bucket)
    document.body.appendChild(createDropdown(bucket))
    document.body.appendChild(createDropdown(bucket["Online"]))
}