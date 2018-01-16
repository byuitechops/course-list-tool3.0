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
        if(Cache){
            localStorage.courses = d3.csvFormat(courses)
        }
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
    return flattened
}

function addDropdown(object){
    function createOption(value,shown){
        var option = document.createElement('option')
        option.value = value
        option.innerHTML = shown
        return option
    }
    
    var select = document.createElement('select')
    
    select.onchange = () => onChange(select)
    select['data-level'] = Levels.length
    select.appendChild(createOption("","--"))
    
    Object.keys(object).sort().forEach(key => {
        select.appendChild(createOption(key,key))
    })
    
    document.getElementById("selectsContainer").appendChild(select)
    Levels.push(select)
    return select
}

var Courses,Bucket,Levels = [],Cache = false

function currentObject(){
    var next = {
        object: Bucket,
        path: []
    }
    for(var i = 0; i < Levels.length; i ++){
        let level = Levels[i]
        
        var currentSelection = level.options[level.selectedIndex].value
        if(currentSelection){
            next.path.push(currentSelection)
            next.object = next.object[currentSelection]
        } else {
            return next
        }
    }
    return next
}

function onChange(select){
    // Delete everything after this one
    Levels.splice(select["data-level"]+1).forEach(sel => sel.parentNode.removeChild(sel))
    document.querySelector('#data').setAttribute('hidden',true)
    
    // If set a value
    var value = select.options[select.selectedIndex].value
    var next = currentObject()
    if(value){
        // If there are more children after this
        if(!next.object.data){
            // Add the next dropdown
            addDropdown(next.object)
        } else {
        // Else display data
            console.log(next.object.data)
            document.querySelector('#code span').innerHTML = next.object.data.code
            document.querySelector('#id span').innerHTML = next.object.data.id
            document.querySelector('#name span').innerHTML = next.object.data.name
            document.querySelector('#data').removeAttribute('hidden')
        }
    }
    
    // update the link
    if(next.path.length){
        var data = flatten(next.object)
        var name = next.path.join('.')+".csv"
        updateDownloadLink(data,name)
    } else {
        updateDownloadLink(Courses,'AllCourses.csv')
    }
}

async function main(){
    Courses = await getCourses()
    Bucket = bucketify(Courses)
    updateDownloadLink(Courses,'AllCourses.csv')
    addDropdown(Bucket)
}

function updateDownloadLink(data,fileName){ 
    var a = document.getElementById("download")
    a.removeAttribute('hidden')
    a.innerHTML = fileName
    
    var csv = d3.csvFormat(data)
    var blob = new Blob([csv],{type:"octet/stream"})
    var url = window.URL.createObjectURL(blob)
    
    a.href = url
    a.download = fileName
}